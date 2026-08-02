import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { StripeConnectService } from '../payment-methods/stripe-connect.service';
import { effectiveOptions } from '../pricing/product-options';
import { EupPricingService, PRODUCTION_SLA_DAYS, type Currency, type FulfilmentMode } from './eup-pricing.service';
import {
  CreateEupSupplierDto,
  PlaceWholesaleOrderDto,
  SetProductionDto,
  UpdateWholesaleOrderStatusDto,
  UpsertDiscountDto,
  UpsertEupFreightDto,
  UpsertEupPriceDto,
  UpsertOfferDto,
} from './wholesale.dto';

const PAID = 'paid';
const AWAITING = 'awaiting_payment';

/**
 * The wholesaler layer. A wholesaler ("EUP") is a Supplier flagged
 * `isWholesaler` that sells to other suppliers rather than to end customers.
 * Suppliers without their own production must order from their assigned
 * wholesaler (or the platform's house wholesaler) to fulfil customer orders,
 * and the wholesaler can ship to the supplier or drop-ship straight to the
 * end customer.
 *
 * What a supplier pays is set by EUP as a fixed price per 1000 pcs plus freight
 * (see EupPricingService) — never derived from the supplier's own retail list.
 * Discounts and promotional offers still exist but are a promo layer only; they
 * no longer feed the price a supplier is charged.
 */
@Injectable()
export class WholesaleService {
  private readonly logger = new Logger(WholesaleService.name);
  private readonly stripe: Stripe;
  private readonly clientUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly connect: StripeConnectService,
    private readonly eupPricing: EupPricingService,
    private readonly audit: AuditService,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_missing');
    this.clientUrl = process.env.CLIENT_URL || 'http://localhost:8080';
  }

  private readonly productInclude = {
    pricingTiers: { orderBy: { minQuantity: 'asc' } },
    options: { orderBy: { sortOrder: 'asc' } },
  } satisfies Prisma.ProductInclude;

  private async requireSupplier(userId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId } });
    if (!supplier) throw new BadRequestException('Not a supplier');
    return supplier;
  }

  /** The wholesaler a supplier orders from: their assigned one, else the house wholesaler. */
  async resolveWholesalerFor(supplier: {
    id: string;
    wholesalerId: string | null;
  }) {
    if (supplier.wholesalerId) {
      const assigned = await this.prisma.supplier.findFirst({
        where: { id: supplier.wholesalerId, isWholesaler: true, status: { not: 'SUSPENDED' } },
      });
      if (assigned) return assigned;
    }
    return this.prisma.supplier.findFirst({
      where: { isHouseWholesaler: true, isWholesaler: true, status: { not: 'SUSPENDED' } },
    });
  }

  private async listValidOffers(wholesalerId: string) {
    const offers = await this.prisma.wholesalerOffer.findMany({
      where: { wholesalerId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    const now = new Date();
    return offers.filter(
      (o) =>
        (!o.validFrom || o.validFrom <= now) && (!o.validUntil || o.validUntil >= now),
    );
  }

  private wholesalerCard(w: {
    id: string;
    companyName: string;
    logoUrl: string | null;
    description: string | null;
    contactEmail: string;
    contactPhone: string | null;
    website: string | null;
    city: string | null;
    country: string | null;
    countryCode: string | null;
    isHouseWholesaler: boolean;
  }) {
    return {
      id: w.id,
      companyName: w.companyName,
      logoUrl: w.logoUrl,
      description: w.description,
      contactEmail: w.contactEmail,
      contactPhone: w.contactPhone,
      website: w.website,
      city: w.city,
      country: w.country,
      countryCode: w.countryCode,
      isHouseWholesaler: w.isHouseWholesaler,
    };
  }

  // ---- Buyer-facing (a supplier ordering from its wholesaler) --------------

  /** Context for the supplier's "Order from wholesaler" page. */
  async getMyWholesaler(userId: string) {
    const supplier = await this.requireSupplier(userId);
    const wholesaler = await this.resolveWholesalerFor(supplier);

    if (!wholesaler) {
      return {
        wholesaler: null,
        offers: [],
        hasOwnProduction: supplier.hasOwnProduction,
        isWholesaler: supplier.isWholesaler,
        mustUseWholesaler: !supplier.hasOwnProduction,
        productionSlaDays: PRODUCTION_SLA_DAYS,
      };
    }

    return {
      wholesaler: this.wholesalerCard(wholesaler),
      // Promotional banners only — offers no longer change what a supplier pays.
      offers: await this.listValidOffers(wholesaler.id),
      hasOwnProduction: supplier.hasOwnProduction,
      isWholesaler: supplier.isWholesaler,
      mustUseWholesaler: !supplier.hasOwnProduction,
      productionSlaDays: PRODUCTION_SLA_DAYS,
    };
  }

  /**
   * The wholesaler's catalog, priced with the fixed EUP price per 1000 pcs that
   * applies to this buyer. A product EUP has not priced for this supplier comes
   * back with `orderable: false` rather than silently falling back to a list
   * price the supplier controls.
   */
  async getCatalog(userId: string) {
    const supplier = await this.requireSupplier(userId);
    const wholesaler = await this.resolveWholesalerFor(supplier);
    if (!wholesaler) return { wholesaler: null, products: [] };

    const products = await this.prisma.product.findMany({
      where: { supplierId: wholesaler.id, isActive: true },
      include: this.productInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const prices = await this.eupPricing.resolvePrices(
      wholesaler.id,
      supplier.id,
      products.map((p) => p.id),
    );

    const shaped = products.map((p) => {
      const priced = prices.get(p.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        wristbandType: p.wristbandType,
        minOrderQuantity: p.minOrderQuantity,
        maxOrderQuantity: p.maxOrderQuantity,
        availableSizes: this.parseJsonArray(p.availableSizes),
        availableColors: this.parseJsonArray(p.availableColors),
        imageUrls: this.parseJsonArray(p.imageUrls),
        options: effectiveOptions(p),
        orderable: !!priced,
        priceSource: priced?.source ?? null,
        pricePer1000Eur: priced?.row.pricePer1000Eur ?? null,
        pricePer1000Usd: priced?.row.pricePer1000Usd ?? null,
        pricePer1000Gbp: priced?.row.pricePer1000Gbp ?? null,
      };
    });

    return { wholesaler: this.wholesalerCard(wholesaler), products: shaped };
  }

  /** What this buyer would pay EUP for a specific product/qty/options. */
  async quoteForBuyer(userId: string, body: PlaceWholesaleOrderDto) {
    const supplier = await this.requireSupplier(userId);
    const wholesaler = await this.resolveWholesalerFor(supplier);
    if (!wholesaler) throw new BadRequestException('No wholesaler is available to order from');

    const product = await this.prisma.product.findFirst({
      where: { id: body.productId, supplierId: wholesaler.id },
      include: this.productInclude,
    });
    if (!product) throw new BadRequestException('That product is not in your wholesaler catalog');

    const fulfilmentMode: FulfilmentMode =
      body.fulfilmentMode === 'DROP_SHIP' ? 'DROP_SHIP' : 'SHIP_TO_SUPPLIER';

    return this.eupPricing.quote({
      wholesalerId: wholesaler.id,
      supplierId: supplier.id,
      product,
      quantity: body.quantity,
      currency: (body.currency as Currency) || 'EUR',
      selectedOptions: body.selectedOptions,
      fulfilmentMode,
      destinationCountryCode: this.destinationCountry(fulfilmentMode, supplier, body.customerInfo),
    });
  }

  /**
   * Where the goods are going, for freight resolution: the end customer's
   * country when drop-shipping, otherwise the buyer supplier's own country.
   */
  private destinationCountry(
    mode: FulfilmentMode,
    supplier: { countryCode: string | null; country: string | null },
    customerInfo?: Record<string, any> | null,
  ): string | null {
    if (mode === 'DROP_SHIP' && customerInfo) {
      const cc = customerInfo.countryCode ?? customerInfo.country_code ?? customerInfo.country;
      if (typeof cc === 'string' && cc.trim()) return cc.trim().toUpperCase().slice(0, 2);
    }
    return supplier.countryCode ?? null;
  }

  async placeOrder(userId: string, dto: PlaceWholesaleOrderDto) {
    const supplier = await this.requireSupplier(userId);
    const wholesaler = await this.resolveWholesalerFor(supplier);
    if (!wholesaler) throw new BadRequestException('No wholesaler is available to order from');
    if (wholesaler.id === supplier.id) {
      throw new BadRequestException('A wholesaler cannot place a wholesale order with itself');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, supplierId: wholesaler.id, isActive: true },
      include: this.productInclude,
    });
    if (!product) throw new BadRequestException('That product is not in your wholesaler catalog');

    const fulfilmentMode: FulfilmentMode =
      dto.fulfilmentMode === 'DROP_SHIP' ? 'DROP_SHIP' : 'SHIP_TO_SUPPLIER';

    // Validate the linked customer order (if any) belongs to this supplier.
    let sourceOrder: { id: string; shippingAddress: string | null } | null = null;
    if (dto.sourceOrderId) {
      const src = await this.prisma.order.findFirst({
        where: { id: dto.sourceOrderId, supplierId: supplier.id },
        select: { id: true, shippingAddress: true },
      });
      if (!src) throw new BadRequestException('The linked customer order was not found');
      sourceOrder = src;
    }

    if (fulfilmentMode === 'DROP_SHIP' && !dto.customerInfo && !sourceOrder?.shippingAddress) {
      throw new BadRequestException(
        'Drop-ship needs the customer delivery details (name, phone, address).',
      );
    }

    const currency = (dto.currency as Currency) || 'EUR';
    // Recomputed server-side; the client's preview quote is never trusted.
    const quote = await this.eupPricing.quote({
      wholesalerId: wholesaler.id,
      supplierId: supplier.id,
      product,
      quantity: dto.quantity,
      currency,
      selectedOptions: dto.selectedOptions,
      fulfilmentMode,
      destinationCountryCode: this.destinationCountry(fulfilmentMode, supplier, dto.customerInfo),
    });

    // Delivery target: the end customer (drop-ship) or the buyer supplier's own
    // address (ship-to-supplier). For the latter, use the address supplied in the
    // order, falling back to the supplier's profile address.
    const shippingAddress =
      fulfilmentMode === 'DROP_SHIP'
        ? dto.customerInfo
          ? JSON.stringify(dto.customerInfo)
          : sourceOrder?.shippingAddress ?? null
        : dto.shippingAddress
          ? JSON.stringify(dto.shippingAddress)
          : supplier.address
            ? JSON.stringify({
                name: supplier.companyName,
                address: supplier.address,
                city: supplier.city,
                country: supplier.country,
                phone: supplier.contactPhone,
              })
            : null;

    const created = await this.prisma.wholesaleOrder.create({
      data: {
        buyerSupplierId: supplier.id,
        wholesalerId: wholesaler.id,
        productId: dto.productId,
        sourceOrderId: sourceOrder?.id ?? null,
        quantity: dto.quantity,
        currency,
        eupPricePer1000: quote.pricePer1000,
        unitPrice: this.round3(quote.goodsTotal / dto.quantity),
        goodsTotal: quote.goodsTotal,
        freightTotal: quote.freightTotal,
        freightRateId: quote.freightRateId,
        totalPrice: quote.total,
        optionsJson: dto.selectedOptions ? JSON.stringify(dto.selectedOptions) : null,
        pricingSnapshotJson: JSON.stringify(quote),
        fulfilmentMode,
        customerInfoJson: dto.customerInfo ? JSON.stringify(dto.customerInfo) : null,
        shippingAddress,
        notes: dto.notes ?? null,
        status: 'PLACED',
      },
    });
    return this.shapeOrder(created, { product, wholesaler });
  }

  /** Wholesale orders this supplier placed (as a buyer). */
  async listOutbound(userId: string) {
    const supplier = await this.requireSupplier(userId);
    const orders = await this.prisma.wholesaleOrder.findMany({
      where: { buyerSupplierId: supplier.id },
      orderBy: { createdAt: 'desc' },
      include: {
        wholesaler: { select: { id: true, companyName: true, contactEmail: true, contactPhone: true } },
      },
    });
    const productIds = [...new Set(orders.map((o) => o.productId).filter(Boolean) as string[])];
    const sourceIds = [...new Set(orders.map((o) => o.sourceOrderId).filter(Boolean) as string[])];
    const [products, sourceOrders] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, wristbandType: true },
      }),
      // What the end customer paid, so the supplier can see its own margin.
      this.prisma.order.findMany({
        where: { id: { in: sourceIds }, supplierId: supplier.id },
        select: { id: true, totalPrice: true, currency: true },
      }),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const bySourceId = new Map(sourceOrders.map((o) => [o.id, o]));
    return orders.map((o) => {
      const source = o.sourceOrderId ? bySourceId.get(o.sourceOrderId) : null;
      return {
        ...this.shapeOrder(o, { product: o.productId ? byId.get(o.productId) : null }),
        wholesaler: o.wholesaler,
        customerPaid: source?.totalPrice ?? null,
        customerCurrency: source?.currency ?? null,
      };
    });
  }

  /** Wholesale orders received by this supplier (acting as a wholesaler). */
  async listInbound(userId: string) {
    const supplier = await this.requireSupplier(userId);
    if (!supplier.isWholesaler) return [];
    const orders = await this.prisma.wholesaleOrder.findMany({
      where: { wholesalerId: supplier.id },
      orderBy: { createdAt: 'desc' },
      include: {
        buyerSupplier: {
          select: { id: true, companyName: true, contactEmail: true, contactPhone: true, city: true, country: true },
        },
      },
    });
    const productIds = [...new Set(orders.map((o) => o.productId).filter(Boolean) as string[])];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, wristbandType: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return orders.map((o) => ({
      ...this.shapeOrder(o, { product: o.productId ? byId.get(o.productId) : null }),
      buyer: o.buyerSupplier,
    }));
  }

  private readonly WS_TRANSITIONS: Record<string, string[]> = {
    PLACED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['IN_PRODUCTION', 'CANCELLED'],
    IN_PRODUCTION: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: [],
  };

  async updateOrderStatus(userId: string, id: string, dto: UpdateWholesaleOrderStatusDto) {
    const supplier = await this.requireSupplier(userId);
    const order = await this.prisma.wholesaleOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Wholesale order not found');

    const isWholesaler = order.wholesalerId === supplier.id;
    const isBuyer = order.buyerSupplierId === supplier.id;
    if (!isWholesaler && !isBuyer) {
      throw new ForbiddenException('You cannot manage this wholesale order');
    }
    // The wholesaler drives fulfilment; the buyer may only cancel while PLACED.
    const next = dto.status.toUpperCase();
    if (next === 'CANCELLED') {
      if (!(isWholesaler || (isBuyer && order.status === 'PLACED'))) {
        throw new ForbiddenException('This order can no longer be cancelled');
      }
    } else if (!isWholesaler) {
      throw new ForbiddenException('Only the wholesaler can advance this order');
    }

    const allowed = this.WS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`Invalid status change from ${order.status} to ${next}`);
    }

    // The buyer pays the wholesaler before production starts (same as a customer
    // paying a supplier). Block production until the wholesale order is paid.
    if (next === 'IN_PRODUCTION' && order.paymentStatus !== PAID) {
      throw new BadRequestException({
        message: 'This wholesale order has not been paid yet. Wait for the buyer to pay (or confirm their payment) before starting production.',
        code: 'WHOLESALE_PAYMENT_REQUIRED',
      });
    }

    const updated = await this.prisma.wholesaleOrder.update({
      where: { id },
      data: {
        status: next,
        trackingNumber: dto.trackingNumber ?? undefined,
        trackingUrl: dto.trackingUrl ?? undefined,
        courier: dto.courier ?? undefined,
        productionStartedAt:
          next === 'IN_PRODUCTION' && !order.productionStartedAt ? new Date() : undefined,
      },
    });

    // Drop-ship loop-closing: when the wholesaler ships/delivers straight to the
    // end customer, mirror that onto the linked customer order so the customer
    // and the supplier both see the real fulfilment state + tracking.
    if (order.fulfilmentMode === 'DROP_SHIP' && order.sourceOrderId && (next === 'SHIPPED' || next === 'DELIVERED')) {
      await this.propagateToCustomerOrder(order.sourceOrderId, next, updated);
    }
    return updated;
  }

  private async propagateToCustomerOrder(
    orderId: string,
    status: 'SHIPPED' | 'DELIVERED',
    ws: { courier: string | null; trackingNumber: string | null; trackingUrl: string | null },
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    // Only advance forward; never move a customer order backwards.
    const rank: Record<string, number> = {
      DRAFT: 0, PLACED: 1, ACCEPTED: 2, IN_PRODUCTION: 3, SHIPPED: 4, DELIVERED: 5, CANCELLED: 6,
    };
    if ((rank[order.status] ?? 0) >= (rank[status] ?? 0) || order.status === 'CANCELLED') return;

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        courier: ws.courier ?? undefined,
        trackingNumber: ws.trackingNumber ?? undefined,
        trackingUrl: ws.trackingUrl ?? undefined,
        shippedAt: status === 'SHIPPED' ? new Date() : undefined,
        deliveredAt: status === 'DELIVERED' ? new Date() : undefined,
      },
    });
    await this.prisma.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: status,
        note: 'Updated by wholesaler drop-ship fulfilment',
      },
    });
  }

  // ---- Wholesale payments (buyer supplier pays the wholesaler) -------------
  // Mirrors the customer→supplier flow: card via the wholesaler's Stripe Connect
  // account, or a manual/offline method (Payoneer, bank, …) with a receipt the
  // wholesaler confirms.

  /** The wholesale order, verified to belong to the requesting buyer. */
  private async buyerOrder(userId: string, id: string) {
    const supplier = await this.requireSupplier(userId);
    const order = await this.prisma.wholesaleOrder.findUnique({ where: { id } });
    if (!order || order.buyerSupplierId !== supplier.id) {
      throw new NotFoundException('Wholesale order not found');
    }
    return order;
  }

  /** Payment methods the wholesaler offers for a wholesale order (buyer view). */
  async getPaymentOptions(userId: string, id: string) {
    const order = await this.buyerOrder(userId, id);
    const wholesaler = await this.prisma.supplier.findUnique({
      where: { id: order.wholesalerId },
      select: { companyName: true },
    });
    const rawMethods = await this.paymentMethods.listActiveForCheckout(order.wholesalerId);
    const methods: Array<{
      id: string;
      provider: string;
      label: string;
      kind: 'stripe' | 'manual';
      available: boolean;
      instructions: Record<string, unknown>;
    }> = [];
    for (const m of rawMethods) {
      if (m.provider === 'STRIPE_CONNECT') {
        const accountId = await this.connect.chargeableAccountId(order.wholesalerId);
        methods.push({ id: m.id, provider: m.provider, label: m.label || 'Card (Stripe)', kind: 'stripe' as const, available: !!accountId, instructions: {} });
      } else {
        methods.push({ id: m.id, provider: m.provider, label: m.label || m.provider, kind: 'manual' as const, available: true, instructions: m.instructions });
      }
    }
    return {
      orderId: order.id,
      wholesalerName: wholesaler?.companyName ?? 'Wholesaler',
      amount: Math.round(Number(order.totalPrice) * 100) / 100,
      currency: order.currency,
      alreadyPaid: order.paymentStatus === PAID,
      receiptUrl: order.paymentReceiptUrl,
      methods,
    };
  }

  /** Card payment: a Stripe Checkout session paying the wholesaler's connected account. */
  async payByStripe(userId: string, id: string) {
    const order = await this.buyerOrder(userId, id);
    if (order.paymentStatus === PAID) throw new BadRequestException('This order is already paid');
    const accountId = await this.connect.chargeableAccountId(order.wholesalerId);
    if (!accountId) {
      throw new BadRequestException('This wholesaler has not finished setting up card payments. Use another method.');
    }
    const currency = (order.currency || 'EUR').toLowerCase();
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(Number(order.totalPrice) * 100),
            product_data: { name: `Wholesale order #${order.id.slice(0, 8)}`, description: `${order.quantity} pcs` },
          },
        },
      ],
      payment_intent_data: { transfer_data: { destination: accountId } },
      success_url: `${this.clientUrl}/supplier/wholesaler?wsession={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.clientUrl}/supplier/wholesaler`,
      metadata: { wholesaleOrderId: order.id, buyerSupplierId: order.buyerSupplierId, wholesalerId: order.wholesalerId },
    });
    await this.prisma.wholesaleOrder.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id, paymentMethodProvider: 'STRIPE_CONNECT', paymentStatus: AWAITING },
    });
    return { url: session.url ?? undefined, sessionId: session.id };
  }

  /** Manual/offline payment: record the method + receipt; wholesaler confirms later. */
  async submitPaymentReceipt(userId: string, id: string, provider: string, receiptUrl?: string) {
    const order = await this.buyerOrder(userId, id);
    if (order.paymentStatus === PAID) throw new BadRequestException('This order is already paid');
    await this.prisma.wholesaleOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: AWAITING,
        paymentMethodProvider: provider,
        paymentReceiptUrl: receiptUrl ?? undefined,
        paymentReceiptUploadedAt: receiptUrl ? new Date() : undefined,
      },
    });
    return { ok: true, orderId: order.id };
  }

  /** Reconcile a Stripe session after the buyer returns from checkout. Idempotent. */
  async confirmStripe(userId: string, sessionId: string) {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    const orderId = session.metadata?.wholesaleOrderId;
    if (!orderId) return { paid: false, orderId: null };
    const order = await this.buyerOrder(userId, orderId);
    if (order.paymentStatus === PAID) return { paid: true, orderId };
    if (session.payment_status !== 'paid') return { paid: false, orderId };
    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    await this.markOrderPaid(order, 'STRIPE_CONNECT', paymentIntentId);
    return { paid: true, orderId };
  }

  /** Wholesaler (or admin) confirms an offline payment was received. */
  async markPaidByWholesaler(user: { id: string; roles: string[] }, id: string) {
    const order = await this.prisma.wholesaleOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Wholesale order not found');
    if (!user.roles.includes('admin')) {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
      if (!supplier || order.wholesalerId !== supplier.id) {
        throw new ForbiddenException('Only the wholesaler can confirm this payment');
      }
    }
    if (order.paymentStatus === PAID) return { alreadyPaid: true, orderId: id };
    await this.markOrderPaid(order, order.paymentMethodProvider || 'MANUAL');
    return { paid: true, orderId: id };
  }

  /**
   * Mark a wholesale order paid, advance PLACED→ACCEPTED, start the delivery
   * clock, and write a ledger row. Payment is what commits EUP to the SLA:
   * production starts on payment and delivery is promised within
   * PRODUCTION_SLA_DAYS of it.
   */
  private async markOrderPaid(
    order: { id: string; status: string; wholesalerId: string; totalPrice: number; currency: string },
    provider: string,
    stripePaymentIntentId?: string,
  ) {
    const paidAt = new Date();
    const promisedDeliveryAt = new Date(
      paidAt.getTime() + PRODUCTION_SLA_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.wholesaleOrder.update({
        where: { id: order.id },
        data: {
          paymentStatus: PAID,
          status: order.status === 'PLACED' ? 'ACCEPTED' : undefined,
          stripePaymentIntentId: stripePaymentIntentId ?? undefined,
          paidAt,
          promisedDeliveryAt,
        },
      });
      await tx.paymentTransaction.create({
        data: {
          orderId: null,
          supplierId: order.wholesalerId,
          provider,
          amount: Number(order.totalPrice),
          currency: order.currency || 'EUR',
          status: 'PAID',
          stripePaymentIntentId: stripePaymentIntentId ?? undefined,
        },
      });
    });
  }

  // ---- Supplier self-service ----------------------------------------------

  async setProduction(userId: string, dto: SetProductionDto) {
    const supplier = await this.requireSupplier(userId);
    return this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { hasOwnProduction: dto.hasOwnProduction },
      select: { id: true, hasOwnProduction: true },
    });
  }

  // ---- Wholesaler self-manages its discounts + offers ---------------------

  /**
   * The EUP account behind the request. The `eup` role gates the route; this
   * additionally proves the account really is a wholesaler, so a stale role
   * grant on a demoted account cannot reach EUP's pricing tools.
   */
  private async requireWholesaler(userId: string) {
    const supplier = await this.requireSupplier(userId);
    if (!supplier.isWholesaler) {
      throw new ForbiddenException('Only EUP can manage prices, freight, discounts and offers');
    }
    return supplier;
  }

  async listDiscounts(userId: string) {
    const w = await this.requireWholesaler(userId);
    return this.prisma.supplierDiscount.findMany({
      where: { wholesalerId: w.id },
      orderBy: { createdAt: 'asc' },
      include: { supplier: { select: { id: true, companyName: true } } },
    });
  }

  async upsertDiscount(userId: string, dto: UpsertDiscountDto) {
    const w = await this.requireWholesaler(userId);
    const supplierId = dto.supplierId?.trim() || null;
    if (supplierId) {
      const buyer = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!buyer) throw new BadRequestException('Target supplier not found');
    }
    // Prisma cannot `upsert` on a compound unique whose part is null (the
    // default/all-suppliers row has supplierId = null), so find-then-write.
    const existing = await this.prisma.supplierDiscount.findFirst({
      where: { wholesalerId: w.id, supplierId },
    });
    if (existing) {
      return this.prisma.supplierDiscount.update({
        where: { id: existing.id },
        data: { percent: dto.percent, note: dto.note ?? null, isActive: dto.isActive ?? true },
      });
    }
    return this.prisma.supplierDiscount.create({
      data: {
        wholesalerId: w.id,
        supplierId,
        percent: dto.percent,
        note: dto.note ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async deleteDiscount(userId: string, id: string) {
    const w = await this.requireWholesaler(userId);
    const row = await this.prisma.supplierDiscount.findFirst({ where: { id, wholesalerId: w.id } });
    if (!row) throw new NotFoundException('Discount not found');
    await this.prisma.supplierDiscount.delete({ where: { id } });
    return { success: true };
  }

  async listOffers(userId: string) {
    const w = await this.requireWholesaler(userId);
    return this.prisma.wholesalerOffer.findMany({
      where: { wholesalerId: w.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createOffer(userId: string, dto: UpsertOfferDto) {
    const w = await this.requireWholesaler(userId);
    const last = await this.prisma.wholesalerOffer.findFirst({
      where: { wholesalerId: w.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.wholesalerOffer.create({
      data: {
        wholesalerId: w.id,
        title: dto.title,
        description: dto.description ?? null,
        discountPercent: dto.discountPercent ?? null,
        code: dto.code ?? null,
        minQuantity: dto.minQuantity ?? null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        isActive: dto.isActive ?? true,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  async updateOffer(userId: string, id: string, dto: UpsertOfferDto) {
    const w = await this.requireWholesaler(userId);
    const row = await this.prisma.wholesalerOffer.findFirst({ where: { id, wholesalerId: w.id } });
    if (!row) throw new NotFoundException('Offer not found');
    return this.prisma.wholesalerOffer.update({
      where: { id },
      data: {
        title: dto.title ?? undefined,
        description: dto.description ?? undefined,
        discountPercent: dto.discountPercent ?? undefined,
        code: dto.code ?? undefined,
        minQuantity: dto.minQuantity ?? undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
  }

  async deleteOffer(userId: string, id: string) {
    const w = await this.requireWholesaler(userId);
    const row = await this.prisma.wholesalerOffer.findFirst({ where: { id, wholesalerId: w.id } });
    if (!row) throw new NotFoundException('Offer not found');
    await this.prisma.wholesalerOffer.delete({ where: { id } });
    return { success: true };
  }

  // ---- EUP's book of suppliers --------------------------------------------
  //
  // EUP manages the suppliers that buy from IT — not every supplier on the
  // platform. Global supplier administration stays with the platform owner at
  // /platform. Scoping this way means a second EUP can never touch a rival's
  // customers, and it keeps destructive actions away from accounts EUP has no
  // relationship with.

  /** The supplier, proven to belong to this EUP's book. */
  private async requireOwnBuyer(wholesalerId: string, isHouse: boolean, supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const mine = supplier.wholesalerId === wholesalerId || (isHouse && supplier.wholesalerId === null);
    if (!mine || supplier.id === wholesalerId) {
      throw new ForbiddenException('That supplier does not buy from you');
    }
    return supplier;
  }

  /**
   * Onboard a supplier into this EUP's book. Returns a generated one-time
   * password for EUP to hand over; it is hashed before storage and never
   * logged, and there is no way to read it back afterwards.
   */
  async createBuyer(userId: string, dto: CreateEupSupplierDto) {
    const w = await this.requireWholesaler(userId);
    const email = dto.email.trim().toLowerCase();

    if (await this.prisma.profile.findUnique({ where: { email } })) {
      throw new BadRequestException('An account with that email already exists');
    }

    const countryCode = dto.countryCode?.trim().toUpperCase().slice(0, 2) || null;
    if (countryCode && !(await this.prisma.country.findUnique({ where: { code: countryCode } }))) {
      throw new BadRequestException('Unknown country code');
    }

    // Generated, not chosen: EUP hands this over and the supplier changes it.
    const tempPassword = `EUW-${randomBytes(9).toString('base64url')}`;
    const created = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.create({
        data: {
          email,
          password: await bcrypt.hash(tempPassword, 10),
          fullName: dto.contactName?.trim() || dto.companyName.trim(),
          isVerified: true,
        },
      });
      await tx.userRole.create({ data: { userId: profile.id, role: 'supplier' } });
      return tx.supplier.create({
        data: {
          userId: profile.id,
          companyName: dto.companyName.trim(),
          contactEmail: email,
          contactPhone: dto.contactPhone?.trim() || null,
          countryCode,
          country: countryCode,
          hasOwnProduction: dto.hasOwnProduction ?? false,
          wholesalerId: w.id,
          status: 'ACTIVE',
        },
      });
    });

    await this.audit.log({
      action: 'eup.supplier.create',
      entityType: 'supplier',
      entityId: created.id,
      actor: { userId, role: 'eup' },
      metadata: { companyName: created.companyName, wholesalerId: w.id },
    });
    return { supplier: created, tempPassword };
  }

  async setBuyerStatus(userId: string, supplierId: string, status: 'ACTIVE' | 'SUSPENDED') {
    const w = await this.requireWholesaler(userId);
    const supplier = await this.requireOwnBuyer(w.id, w.isHouseWholesaler, supplierId);
    const updated = await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { status },
    });
    await this.audit.log({
      action: status === 'SUSPENDED' ? 'eup.supplier.suspend' : 'eup.supplier.activate',
      entityType: 'supplier',
      entityId: supplier.id,
      actor: { userId, role: 'eup' },
      metadata: { wholesalerId: w.id },
    });
    return updated;
  }

  async setBuyerProduction(userId: string, supplierId: string, hasOwnProduction: boolean) {
    const w = await this.requireWholesaler(userId);
    const supplier = await this.requireOwnBuyer(w.id, w.isHouseWholesaler, supplierId);
    const updated = await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { hasOwnProduction },
    });
    await this.audit.log({
      action: 'eup.supplier.set_production',
      entityType: 'supplier',
      entityId: supplier.id,
      actor: { userId, role: 'eup' },
      metadata: { hasOwnProduction },
    });
    return updated;
  }

  /**
   * Remove a supplier from the platform entirely.
   *
   * Refused once the supplier has any customer order or any wholesale order:
   * the platform-owner version detaches orders to keep the history, but an EUP
   * orphaning another party's sales records is not a call EUP should make.
   * Suspension is the reversible answer and is what we point them at.
   */
  async deleteBuyer(userId: string, supplierId: string) {
    const w = await this.requireWholesaler(userId);
    const supplier = await this.requireOwnBuyer(w.id, w.isHouseWholesaler, supplierId);

    const [orderCount, wholesaleCount] = await Promise.all([
      this.prisma.order.count({ where: { supplierId: supplier.id } }),
      this.prisma.wholesaleOrder.count({ where: { buyerSupplierId: supplier.id } }),
    ]);
    if (orderCount > 0 || wholesaleCount > 0) {
      throw new BadRequestException({
        message: `${supplier.companyName} has ${orderCount} customer order(s) and ${wholesaleCount} order(s) with you. Suspend them instead — deleting would detach those records.`,
        code: 'SUPPLIER_HAS_ORDERS',
        orderCount,
        wholesaleCount,
      });
    }

    await this.prisma.supplier.delete({ where: { id: supplier.id } });
    await this.audit.log({
      action: 'eup.supplier.delete',
      entityType: 'supplier',
      entityId: supplier.id,
      actor: { userId, role: 'eup' },
      metadata: { companyName: supplier.companyName, wholesalerId: w.id },
    });
    return { success: true };
  }

  // ---- Sales insights ------------------------------------------------------

  /**
   * The things that quietly cost EUP money: products no supplier can see
   * because they have no price, suppliers who have never ordered, and orders
   * stuck waiting on payment. Each entry is something EUP can act on today.
   */
  async getInsights(userId: string) {
    const w = await this.requireWholesaler(userId);
    const [products, prices, buyers, orders] = await Promise.all([
      this.prisma.product.findMany({
        where: { supplierId: w.id, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.eupPrice.findMany({
        where: { wholesalerId: w.id, isActive: true },
        select: { productId: true, supplierId: true },
      }),
      this.listBuyers(userId),
      this.prisma.wholesaleOrder.findMany({
        where: { wholesalerId: w.id },
        select: {
          id: true,
          buyerSupplierId: true,
          totalPrice: true,
          currency: true,
          status: true,
          paymentStatus: true,
          promisedDeliveryAt: true,
          createdAt: true,
        },
      }),
    ]);

    const hasDefault = new Set(prices.filter((p) => !p.supplierId).map((p) => p.productId));
    // A product with no default price is invisible to every supplier who has no
    // explicit override — the single most common reason nothing sells.
    const unpricedProducts = products.filter((p) => !hasDefault.has(p.id));

    const buyersWithOrders = new Set(orders.map((o) => o.buyerSupplierId));
    const dormantBuyers = buyers.filter((b) => !buyersWithOrders.has(b.id));

    const paid = orders.filter((o) => o.paymentStatus === 'paid');
    const awaitingPayment = orders.filter(
      (o) => o.paymentStatus !== 'paid' && o.status !== 'CANCELLED',
    );
    const now = Date.now();
    const overdue = orders.filter(
      (o) =>
        o.promisedDeliveryAt &&
        !['DELIVERED', 'CANCELLED'].includes(o.status) &&
        o.promisedDeliveryAt.getTime() < now,
    );

    // Revenue by month over the last 6 months, oldest first.
    const months: Array<{ month: string; revenue: number; orders: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      const inMonth = paid.filter((o) => o.createdAt >= d && o.createdAt < next);
      months.push({
        month: d.toLocaleString('en', { month: 'short' }),
        revenue: this.round3(inMonth.reduce((s, o) => s + (o.totalPrice || 0), 0)),
        orders: inMonth.length,
      });
    }

    // Who actually brings the money in.
    const spendByBuyer = new Map<string, number>();
    for (const o of paid) {
      spendByBuyer.set(o.buyerSupplierId, (spendByBuyer.get(o.buyerSupplierId) ?? 0) + (o.totalPrice || 0));
    }
    const topBuyers = buyers
      .map((b) => ({ id: b.id, companyName: b.companyName, spend: this.round3(spendByBuyer.get(b.id) ?? 0) }))
      .filter((b) => b.spend > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);

    return {
      totals: {
        buyers: buyers.length,
        activeBuyers: buyersWithOrders.size,
        dormantBuyers: dormantBuyers.length,
        paidRevenue: this.round3(paid.reduce((s, o) => s + (o.totalPrice || 0), 0)),
        awaitingPaymentValue: this.round3(
          awaitingPayment.reduce((s, o) => s + (o.totalPrice || 0), 0),
        ),
        awaitingPaymentCount: awaitingPayment.length,
        overdueCount: overdue.length,
      },
      unpricedProducts,
      dormantBuyers: dormantBuyers.map((b) => ({
        id: b.id,
        companyName: b.companyName,
        contactEmail: b.contactEmail,
        hasOwnProduction: b.hasOwnProduction,
      })),
      months,
      topBuyers,
    };
  }

  // ---- EUP price lists ----------------------------------------------------

  /**
   * The suppliers who buy from this EUP — those explicitly assigned to it, plus
   * (for the house account) everyone who falls back to it. These are EUP's
   * customers and the columns of its price grid.
   */
  async listBuyers(userId: string) {
    const w = await this.requireWholesaler(userId);
    return this.prisma.supplier.findMany({
      where: {
        id: { not: w.id },
        isWholesaler: false,
        ...(w.isHouseWholesaler
          ? { OR: [{ wholesalerId: w.id }, { wholesalerId: null }] }
          : { wholesalerId: w.id }),
      },
      select: {
        id: true,
        companyName: true,
        contactEmail: true,
        country: true,
        countryCode: true,
        status: true,
        hasOwnProduction: true,
      },
      orderBy: { companyName: 'asc' },
    });
  }

  async listEupPrices(userId: string) {
    const w = await this.requireWholesaler(userId);
    return this.prisma.eupPrice.findMany({
      where: { wholesalerId: w.id },
      include: {
        product: { select: { id: true, name: true, wristbandType: true } },
        supplier: { select: { id: true, companyName: true } },
      },
      orderBy: [{ productId: 'asc' }, { supplierId: 'asc' }],
    });
  }

  async upsertEupPrice(userId: string, dto: UpsertEupPriceDto) {
    const w = await this.requireWholesaler(userId);
    const supplierId = dto.supplierId?.trim() || null;

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, supplierId: w.id },
      select: { id: true },
    });
    if (!product) throw new BadRequestException('You can only price your own products');

    if (supplierId) {
      const buyer = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!buyer) throw new BadRequestException('Target supplier not found');
      if (buyer.id === w.id) throw new BadRequestException('You cannot set a price for yourself');
    }

    const data = {
      pricePer1000Eur: dto.pricePer1000Eur,
      pricePer1000Usd: dto.pricePer1000Usd ?? null,
      pricePer1000Gbp: dto.pricePer1000Gbp ?? null,
      note: dto.note ?? null,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      isActive: dto.isActive ?? true,
    };

    // Prisma cannot upsert on a compound unique whose part is null (the
    // default/all-suppliers row has supplierId = null), so find-then-write.
    const existing = await this.prisma.eupPrice.findFirst({
      where: { wholesalerId: w.id, productId: dto.productId, supplierId },
    });
    if (existing) {
      return this.prisma.eupPrice.update({ where: { id: existing.id }, data });
    }
    return this.prisma.eupPrice.create({
      data: { wholesalerId: w.id, productId: dto.productId, supplierId, ...data },
    });
  }

  async deleteEupPrice(userId: string, id: string) {
    const w = await this.requireWholesaler(userId);
    const row = await this.prisma.eupPrice.findFirst({ where: { id, wholesalerId: w.id } });
    if (!row) throw new NotFoundException('Price not found');
    await this.prisma.eupPrice.delete({ where: { id } });
    return { success: true };
  }

  // ---- EUP freight rates --------------------------------------------------

  async listEupFreight(userId: string) {
    const w = await this.requireWholesaler(userId);
    return this.prisma.eupFreightRate.findMany({
      where: { wholesalerId: w.id },
      include: { supplier: { select: { id: true, companyName: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private freightData(dto: UpsertEupFreightDto) {
    return {
      supplierId: dto.supplierId?.trim() || null,
      countryCode: dto.countryCode?.trim().toUpperCase().slice(0, 2) || null,
      fulfilmentMode: dto.fulfilmentMode ?? 'ANY',
      label: dto.label ?? null,
      pricePer1000Eur: dto.pricePer1000Eur,
      pricePer1000Usd: dto.pricePer1000Usd ?? null,
      pricePer1000Gbp: dto.pricePer1000Gbp ?? null,
      minChargeEur: dto.minChargeEur ?? null,
      minChargeUsd: dto.minChargeUsd ?? null,
      minChargeGbp: dto.minChargeGbp ?? null,
      freeOverQty: dto.freeOverQty ?? null,
      estMinDays: dto.estMinDays ?? null,
      estMaxDays: dto.estMaxDays ?? null,
      isActive: dto.isActive ?? true,
    };
  }

  async createEupFreight(userId: string, dto: UpsertEupFreightDto) {
    const w = await this.requireWholesaler(userId);
    const data = this.freightData(dto);
    if (data.supplierId) {
      const buyer = await this.prisma.supplier.findUnique({ where: { id: data.supplierId } });
      if (!buyer) throw new BadRequestException('Target supplier not found');
    }
    const last = await this.prisma.eupFreightRate.findFirst({
      where: { wholesalerId: w.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.eupFreightRate.create({
      data: {
        wholesalerId: w.id,
        ...data,
        sortOrder: dto.sortOrder ?? (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  async updateEupFreight(userId: string, id: string, dto: UpsertEupFreightDto) {
    const w = await this.requireWholesaler(userId);
    const row = await this.prisma.eupFreightRate.findFirst({ where: { id, wholesalerId: w.id } });
    if (!row) throw new NotFoundException('Freight rate not found');
    return this.prisma.eupFreightRate.update({
      where: { id },
      data: { ...this.freightData(dto), sortOrder: dto.sortOrder ?? undefined },
    });
  }

  async deleteEupFreight(userId: string, id: string) {
    const w = await this.requireWholesaler(userId);
    const row = await this.prisma.eupFreightRate.findFirst({ where: { id, wholesalerId: w.id } });
    if (!row) throw new NotFoundException('Freight rate not found');
    await this.prisma.eupFreightRate.delete({ where: { id } });
    return { success: true };
  }

  // ---- helpers ------------------------------------------------------------

  private round3(v: number): number {
    return Math.round((v + Number.EPSILON) * 1000) / 1000;
  }
  private parseJsonArray(s?: string | null): any[] {
    if (!s) return [];
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  private shapeOrder(
    o: {
      id: string;
      quantity: number;
      currency: string;
      listUnitPrice: number | null;
      unitPrice: number | null;
      discountPercent: number;
      totalPrice: number;
      eupPricePer1000: number | null;
      goodsTotal: number | null;
      freightTotal: number | null;
      paidAt: Date | null;
      productionStartedAt: Date | null;
      promisedDeliveryAt: Date | null;
      status: string;
      paymentStatus: string | null;
      paymentMethodProvider: string | null;
      paymentReceiptUrl: string | null;
      fulfilmentMode: string;
      sourceOrderId: string | null;
      customerInfoJson: string | null;
      shippingAddress: string | null;
      optionsJson: string | null;
      trackingNumber: string | null;
      trackingUrl: string | null;
      courier: string | null;
      notes: string | null;
      createdAt: Date;
      productId: string | null;
    },
    extra: { product?: { id: string; name: string; wristbandType: string } | null; wholesaler?: { id: string; companyName: string } },
  ) {
    return {
      id: o.id,
      quantity: o.quantity,
      currency: o.currency,
      listUnitPrice: o.listUnitPrice,
      unitPrice: o.unitPrice,
      discountPercent: o.discountPercent,
      totalPrice: o.totalPrice,
      eupPricePer1000: o.eupPricePer1000,
      goodsTotal: o.goodsTotal,
      freightTotal: o.freightTotal,
      paidAt: o.paidAt,
      productionStartedAt: o.productionStartedAt,
      promisedDeliveryAt: o.promisedDeliveryAt,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethodProvider: o.paymentMethodProvider,
      paymentReceiptUrl: o.paymentReceiptUrl,
      fulfilmentMode: o.fulfilmentMode,
      sourceOrderId: o.sourceOrderId,
      customerInfo: o.customerInfoJson ? this.safeParse(o.customerInfoJson) : null,
      shippingAddress: o.shippingAddress ? this.safeParse(o.shippingAddress) : null,
      selectedOptions: o.optionsJson ? this.safeParse(o.optionsJson) : null,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      courier: o.courier,
      notes: o.notes,
      createdAt: o.createdAt,
      product: extra.product ?? null,
      wholesaler: extra.wholesaler ?? undefined,
    };
  }
  private safeParse(s: string): any {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
}
