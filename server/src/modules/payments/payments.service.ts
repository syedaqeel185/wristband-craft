import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { EmailService } from '../email/email.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { StripeConnectService } from '../payment-methods/stripe-connect.service';

const PAID = 'paid';
const AWAITING = 'awaiting_payment';
const READY_FOR_PRODUCTION = 'ACCEPTED'; // payment confirmed → ready for the supplier to produce

/** One entry per supplier group returned to the checkout UI. */
export interface CheckoutRoute {
  supplierId: string;
  supplierName?: string;
  orderIds: string[];
  amount: number;
  currency: string;
  type: 'stripe' | 'manual' | 'unavailable';
  provider?: string;
  label?: string | null;
  url?: string;
  sessionId?: string;
  instructions?: Record<string, unknown>;
  message?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;
  private readonly clientUrl: string;
  private readonly platformFeePercent: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly email: EmailService,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly connect: StripeConnectService,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) this.logger.warn('STRIPE_SECRET_KEY is not set — payments will fail.');
    this.stripe = new Stripe(key || 'sk_test_missing');
    this.clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    // Optional marketplace fee taken by the platform on each customer payment.
    this.platformFeePercent = Math.max(0, Math.min(100, Number(process.env.PLATFORM_FEE_PERCENT) || 0));
  }

  /**
   * Route the given (own, unpaid) orders to each supplier's configured payment
   * method — this is the core of the marketplace model: customer money goes to
   * the supplier, not the platform.
   *  - Stripe Connect (charges enabled): a Checkout Session per supplier with a
   *    destination charge to the connected account (+ optional platform fee).
   *  - Manual/bank/wallet: orders are marked awaiting_payment and the supplier's
   *    payment instructions are returned for the customer to pay offline.
   *  - No usable method: that supplier's orders are reported as unavailable.
   * Returns one route per supplier so the UI can drive each payment.
   */
  async createCheckoutSession(userId: string, orderIds: string[]) {
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds }, userId },
      include: {
        design: { select: { wristbandType: true } },
        supplier: { select: { id: true, companyName: true } },
      },
    });

    if (orders.length === 0) {
      throw new BadRequestException('No payable orders found');
    }
    if (orders.find((o) => o.paymentStatus === PAID)) {
      throw new BadRequestException('One or more orders are already paid');
    }
    if (orders.find((o) => !o.supplierId)) {
      throw new BadRequestException('Every order must be routed to a supplier before payment');
    }

    // Group by supplier — a Checkout Session (destination charge) targets a
    // single connected account, so each supplier is paid separately.
    const groups = new Map<string, typeof orders>();
    for (const o of orders) {
      const key = o.supplierId as string;
      if (!groups.has(key)) groups.set(key, [] as unknown as typeof orders);
      groups.get(key)!.push(o);
    }

    const routes: CheckoutRoute[] = [];
    for (const [supplierId, group] of groups) {
      const currency = (group[0].currency || 'EUR').toLowerCase();
      const amount = group.reduce((s, o) => s + Number(o.totalPrice), 0);
      const groupOrderIds = group.map((o) => o.id);
      const supplierName = group[0].supplier?.companyName;
      const method = await this.paymentMethods.getDefaultForCheckout(supplierId);

      if (!method) {
        routes.push({
          supplierId, supplierName, orderIds: groupOrderIds, amount, currency: currency.toUpperCase(),
          type: 'unavailable',
          message: `${supplierName ?? 'This supplier'} has not set up a payment method yet.`,
        });
        continue;
      }

      if (method.provider === 'STRIPE_CONNECT') {
        const accountId = await this.connect.chargeableAccountId(supplierId);
        if (!accountId) {
          routes.push({
            supplierId, supplierName, orderIds: groupOrderIds, amount, currency: currency.toUpperCase(),
            type: 'unavailable',
            message: `${supplierName ?? 'This supplier'} has not finished setting up Stripe payments.`,
          });
          continue;
        }
        const feeAmount = Math.round(amount * 100 * (this.platformFeePercent / 100));
        const session = await this.stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: group.map((o) => ({
            quantity: 1,
            price_data: {
              currency,
              unit_amount: Math.round(Number(o.totalPrice) * 100),
              product_data: {
                name: `Wristband order #${o.id.slice(0, 8)}`,
                description: `${o.design?.wristbandType ?? 'wristband'} · ${o.quantity} pcs`,
              },
            },
          })),
          payment_intent_data: {
            transfer_data: { destination: accountId },
            ...(feeAmount > 0 ? { application_fee_amount: feeAmount } : {}),
          },
          success_url: `${this.clientUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${this.clientUrl}/order-summary`,
          client_reference_id: userId,
          metadata: { orderIds: groupOrderIds.join(','), userId, supplierId },
        });
        await this.prisma.order.updateMany({
          where: { id: { in: groupOrderIds } },
          data: { stripeSessionId: session.id },
        });
        routes.push({
          supplierId, supplierName, orderIds: groupOrderIds, amount, currency: currency.toUpperCase(),
          type: 'stripe', provider: 'STRIPE_CONNECT', url: session.url ?? undefined, sessionId: session.id,
        });
        continue;
      }

      // Manual / offline provider: show the supplier's instructions; the order
      // waits for the supplier to confirm receipt (markManualPaid).
      await this.prisma.order.updateMany({
        where: { id: { in: groupOrderIds } },
        data: { paymentStatus: AWAITING },
      });
      routes.push({
        supplierId, supplierName, orderIds: groupOrderIds, amount, currency: currency.toUpperCase(),
        type: 'manual', provider: method.provider, label: method.label, instructions: method.instructions,
      });
    }

    // Back-compat: expose the first Stripe URL directly for single-supplier carts.
    const firstStripe = routes.find((r) => r.type === 'stripe');
    return { routes, url: firstStripe?.url, sessionId: firstStripe?.sessionId };
  }

  /**
   * Reconcile a checkout session after the success redirect: if Stripe reports
   * the session paid, mark the orders paid and advance them to production.
   * Idempotent — safe to call more than once.
   */
  async confirmSession(userId: string, sessionId: string) {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);

    if (session.client_reference_id && session.client_reference_id !== userId) {
      throw new BadRequestException('This payment session does not belong to you');
    }

    const paid = session.payment_status === 'paid';
    const orderIds = (session.metadata?.orderIds || '').split(',').filter(Boolean);
    if (orderIds.length === 0) {
      return { paid, orders: [] };
    }

    if (!paid) {
      return { paid: false, orders: [] };
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds }, userId },
      include: {
        user: { select: { email: true, fullName: true } },
        supplier: { select: { contactEmail: true, companyName: true } },
      },
    });

    const updated: Array<(typeof orders)[number]> = [];
    for (const order of orders) {
      if (order.paymentStatus === PAID) {
        updated.push(order);
        continue;
      }
      const result = await this.prisma.$transaction(async (tx) => {
        const o = await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: PAID,
            status: READY_FOR_PRODUCTION,
            stripePaymentIntentId: paymentIntentId,
          },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: READY_FOR_PRODUCTION,
            note: 'Payment received — ready for production',
            updatedByUserId: userId,
          },
        });
        // Ledger entry: customer -> supplier payment (Stripe Connect).
        if (order.supplierId) {
          await tx.paymentTransaction.create({
            data: {
              orderId: order.id,
              supplierId: order.supplierId,
              provider: 'STRIPE_CONNECT',
              amount: Number(order.totalPrice),
              currency: order.currency || 'EUR',
              status: 'PAID',
              stripePaymentIntentId: paymentIntentId,
              platformFeeAmount: Math.round(Number(order.totalPrice) * (this.platformFeePercent / 100) * 100) / 100,
            },
          });
        }
        return o;
      });

      const orderInfo = {
        id: order.id,
        quantity: order.quantity,
        totalPrice: order.totalPrice,
        currency: order.currency,
      };

      // Notify the supplier that a paid order has arrived.
      if (order.supplier?.contactEmail) {
        await this.email.supplierNewOrder(
          order.supplier.contactEmail,
          order.supplier.companyName,
          orderInfo,
          order.user?.fullName || order.user?.email || null,
        );
      }

      updated.push({ ...result, user: order.user, supplier: order.supplier });
    }

    return { paid: true, orders: updated };
  }

  /**
   * Supplier (or admin) confirms an offline/manual payment was received for one
   * of their orders: marks it paid and advances it to production-ready.
   */
  async markManualPaid(user: { id: string; roles: string[] }, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { email: true, fullName: true } },
        supplier: { select: { id: true, userId: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!user.roles.includes('admin')) {
      if (!order.supplier || order.supplier.userId !== user.id) {
        throw new ForbiddenException('You can only confirm payment for your own orders');
      }
    }
    if (order.paymentStatus === PAID) {
      return { alreadyPaid: true, orderId };
    }

    const method = order.supplierId
      ? await this.paymentMethods.getDefaultForCheckout(order.supplierId)
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: PAID, status: READY_FOR_PRODUCTION },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: READY_FOR_PRODUCTION,
          note: 'Manual payment confirmed by supplier',
          updatedByUserId: user.id,
        },
      });
      if (order.supplierId) {
        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            supplierId: order.supplierId,
            paymentMethodId: method?.id,
            provider: method?.provider ?? 'MANUAL',
            amount: Number(order.totalPrice),
            currency: order.currency || 'EUR',
            status: 'PAID',
          },
        });
      }
    });

    if (order.user?.email) {
      await this.email.orderAccepted(order.user.email, order.user.fullName, {
        id: order.id,
        quantity: order.quantity,
        totalPrice: order.totalPrice,
        currency: order.currency,
      });
    }
    return { paid: true, orderId };
  }
}
