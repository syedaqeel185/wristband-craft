import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { EmailService } from '../email/email.service';

const PAID = 'paid';
const READY_FOR_PRODUCTION = 'ACCEPTED'; // payment confirmed → ready for the supplier to produce

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;
  private readonly clientUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly email: EmailService,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) this.logger.warn('STRIPE_SECRET_KEY is not set — payments will fail.');
    this.stripe = new Stripe(key || 'sk_test_missing');
    this.clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  }

  /** Create a Stripe Checkout session for the given (own, unpaid) orders. */
  async createCheckoutSession(userId: string, orderIds: string[]) {
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds }, userId },
      include: { design: { select: { wristbandType: true } } },
    });

    if (orders.length === 0) {
      throw new BadRequestException('No payable orders found');
    }
    const alreadyPaid = orders.find((o) => o.paymentStatus === PAID);
    if (alreadyPaid) {
      throw new BadRequestException('One or more orders are already paid');
    }

    const currency = (orders[0].currency || 'EUR').toLowerCase();

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: orders.map((o) => ({
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
      success_url: `${this.clientUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.clientUrl}/order-summary`,
      client_reference_id: userId,
      metadata: { orderIds: orders.map((o) => o.id).join(','), userId },
    });

    // Remember the session on each order so we can reconcile later.
    await this.prisma.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { stripeSessionId: session.id },
    });

    return { url: session.url, sessionId: session.id };
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
}
