import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PricingService } from '../pricing/pricing.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { BulkOrderUpdateDto, CreateOrderDto, UpdateOrderStatusDto, UpdateShipmentDto } from './orders.dto';

const CONFIRM_PURPOSE = 'confirm-production';

const ORDER_STATUS = {
  DRAFT: 'DRAFT',
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  IN_PRODUCTION: 'IN_PRODUCTION',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  [ORDER_STATUS.DRAFT]: [ORDER_STATUS.PLACED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PLACED]: [ORDER_STATUS.ACCEPTED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.ACCEPTED]: [ORDER_STATUS.IN_PRODUCTION, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.IN_PRODUCTION]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.DELIVERED]: [],
  [ORDER_STATUS.CANCELLED]: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly email: EmailService,
    private readonly pricing: PricingService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** Signed, time-limited token embedded in the "confirm your order" email link. */
  buildProductionConfirmToken(orderId: string): string {
    return this.jwtService.sign({ orderId, purpose: CONFIRM_PURPOSE });
  }

  /**
   * Customer-facing: confirm an order (from the email link) to start production.
   * ACCEPTED (paid) -> IN_PRODUCTION. Token-authenticated, so no login required.
   */
  async confirmProduction(token: string) {
    let payload: { orderId?: string; purpose?: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new BadRequestException('This confirmation link is invalid or has expired');
    }
    if (payload.purpose !== CONFIRM_PURPOSE || !payload.orderId) {
      throw new BadRequestException('Invalid confirmation link');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      include: {
        user: { select: { email: true, fullName: true } },
        supplier: { select: { contactEmail: true, companyName: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const current = this.normalizeStatus(order.status);
    if (current === ORDER_STATUS.IN_PRODUCTION || current === ORDER_STATUS.SHIPPED || current === ORDER_STATUS.DELIVERED) {
      return { alreadyConfirmed: true, status: current };
    }
    if (current !== ORDER_STATUS.ACCEPTED) {
      throw new BadRequestException(
        'This order is not ready to confirm. Make sure payment has completed first.',
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: ORDER_STATUS.IN_PRODUCTION },
    });
    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: ORDER_STATUS.IN_PRODUCTION,
        note: 'Customer confirmed — production started',
        updatedByUserId: order.userId,
      },
    });

    const info = { id: order.id, quantity: order.quantity, totalPrice: order.totalPrice, currency: order.currency };
    if (order.user?.email) {
      await this.email.productionStarted(order.user.email, order.user.fullName, info);
    }
    if (order.supplier?.contactEmail) {
      await this.email.supplierOrderConfirmed(order.supplier.contactEmail, order.supplier.companyName, info);
    }
    return { confirmed: true, status: ORDER_STATUS.IN_PRODUCTION, orderId: updated.id };
  }

  private normalizeStatus(status?: string): string {
    return (status || '').trim().toUpperCase();
  }

  private sumExtraCharges(extraCharges?: unknown): number {
    if (!extraCharges || typeof extraCharges !== 'object') return 0;
    return Object.values(extraCharges as Record<string, unknown>).reduce<number>(
      (sum, v) => sum + (Number(v) || 0),
      0,
    );
  }

  private safeParseObject(s?: string | null): Record<string, any> {
    if (!s) return {};
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  }

  /**
   * The buyer's contact details shown to the supplier fulfilling the order, so
   * they can reach the customer directly. Phone/address come from the shipping
   * details captured at checkout (Profile has no phone field of its own).
   */
  private buildBuyerContact(
    user: { email: string | null; fullName: string | null } | null,
    shipping: Record<string, any> | null,
  ) {
    return {
      name: shipping?.name || shipping?.fullName || user?.fullName || null,
      email: user?.email || shipping?.email || null,
      phone: shipping?.phone || shipping?.contactPhone || null,
      address: shipping?.address || shipping?.line1 || shipping?.street || null,
      city: shipping?.city || null,
      country: shipping?.country || null,
    };
  }

  /** The supplier's contact details shown to the customer who ordered from them. */
  private buildSupplierContact(
    supplier:
      | {
          companyName: string;
          contactEmail: string | null;
          contactPhone: string | null;
          website: string | null;
          city: string | null;
          country: string | null;
        }
      | null,
  ) {
    if (!supplier) return null;
    return {
      companyName: supplier.companyName,
      email: supplier.contactEmail,
      phone: supplier.contactPhone,
      website: supplier.website,
      city: supplier.city,
      country: supplier.country,
    };
  }

  /** Map the studio's print type (+ saved meta) to the pricing engine's enum. */
  private mapPrintType(printType?: string, meta?: Record<string, any>): 'none' | 'black' | 'color' {
    const p = printType || meta?.printType;
    if (p === 'full_color' || p === 'color') return 'color';
    if (p === 'black') return 'black';
    return 'none';
  }

  /** Supplier-configured options selected by the customer, from the saved design meta. */
  private selectedOptionsFrom(
    meta: Record<string, any>,
  ): { key: string; choiceKey?: string }[] | undefined {
    const v = meta?.selectedOptions;
    if (!Array.isArray(v)) return undefined;
    return v
      .filter((s) => s && typeof s.key === 'string')
      .map((s) => ({
        key: s.key,
        choiceKey: typeof s.choiceKey === 'string' ? s.choiceKey : undefined,
      }));
  }

  private validateTransition(fromStatus: string, toStatus: string) {
    const normalizedFrom = this.normalizeStatus(fromStatus);
    const normalizedTo = this.normalizeStatus(toStatus);
    const allowed = ALLOWED_TRANSITIONS[normalizedFrom];
    if (!allowed) {
      throw new BadRequestException(`Unsupported current order status: ${fromStatus}`);
    }
    if (!allowed.includes(normalizedTo)) {
      throw new BadRequestException(
        `Invalid status transition from ${normalizedFrom} to ${normalizedTo}`,
      );
    }
  }

  async create(userId: string, createOrderDto: CreateOrderDto) {
    const { customizationNotes, userId: _uid, shippingAddress, extraCharges } = createOrderDto;
    const designId = createOrderDto.designId?.trim() || undefined;
    const supplierId = createOrderDto.supplierId?.trim() || undefined;
    const productId = createOrderDto.productId?.trim() || undefined;

    if (designId) {
      const design = await this.prisma.design.findFirst({ where: { id: designId, userId } });
      if (!design) {
        throw new BadRequestException('Design not found or you do not have access to it');
      }
    }
    if (supplierId) {
      const sup = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!sup) {
        throw new BadRequestException('Invalid supplier. Add a supplier in the app or select one from the list.');
      }
    }

    if (!Number.isFinite(createOrderDto.quantity)) {
      throw new BadRequestException('Order quantity must be a valid number');
    }

    // Pricing integrity: when an order is tied to a product, the SERVER computes
    // the authoritative price from PricingService — never trust the client total.
    let totalPrice = createOrderDto.totalPrice;
    let unitPrice = createOrderDto.unitPrice;
    let basePrice = createOrderDto.basePrice;
    let pricingSnapshot: unknown = extraCharges ?? {};
    if (productId) {
      const meta = this.safeParseObject(customizationNotes);
      const quote = await this.pricing.quote({
        productId,
        quantity: Math.round(createOrderDto.quantity),
        currency: (createOrderDto.currency as 'USD' | 'EUR' | 'GBP') || 'EUR',
        printType: this.mapPrintType(createOrderDto.printType, meta),
        qrEnabled: meta.hasQrCode === true || createOrderDto.hasSecureGuests === true,
        trademarkEnabled: meta.hasTrademark === true,
        hasCustomDesign:
          meta.hasPrint === true || (!!createOrderDto.printType && createOrderDto.printType !== 'none'),
        hasLogo: meta.hasLogo === true,
        selectedOptions: this.selectedOptionsFrom(meta),
      });
      totalPrice = quote.total;
      unitPrice = quote.unitPrice;
      basePrice = quote.components.find((c) => c.code === 'base')?.unitAmount ?? quote.unitPrice;
      pricingSnapshot = quote;
    } else if (!Number.isFinite(totalPrice)) {
      throw new BadRequestException('Order total must be a valid number');
    }

    // Extra charges (e.g. express delivery) are quoted to the customer on top
    // of the product price, so they must be folded into the authoritative total.
    const extraChargesTotal = this.sumExtraCharges(extraCharges);
    totalPrice = (totalPrice ?? 0) + extraChargesTotal;

    const initialStatus = this.normalizeStatus(createOrderDto.status) || ORDER_STATUS.PLACED;

    if (initialStatus !== ORDER_STATUS.DRAFT && initialStatus !== ORDER_STATUS.PLACED) {
      throw new BadRequestException('New orders can only start as DRAFT or PLACED');
    }

    // Gate: a supplier must have an active subscription (and not be suspended)
    // to receive new orders. DRAFTs (unsubmitted carts) are not gated.
    if (supplierId && initialStatus === ORDER_STATUS.PLACED) {
      await this.subscriptions.assertActive(supplierId);
    }

    try {
      const created = await this.prisma.order.create({
        data: {
          userId,
          designId,
          supplierId,
          productId,
          quantity: Math.round(createOrderDto.quantity),
          totalPrice,
          unitPrice: unitPrice ?? undefined,
          basePrice: basePrice ?? undefined,
          status: initialStatus,
          paymentStatus: createOrderDto.paymentStatus,
          currency: createOrderDto.currency,
          printType: createOrderDto.printType,
          hasSecureGuests: createOrderDto.hasSecureGuests,
          adminNotes: createOrderDto.adminNotes,
          customizationNotes: customizationNotes ?? undefined,
          shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : undefined,
          extraCharges: extraCharges != null ? JSON.stringify(extraCharges) : undefined,
          pricingSnapshotJson: JSON.stringify(pricingSnapshot),
          designSnapshotJson: JSON.stringify({ designId }),
          createdAt: new Date(),
        },
        include: {
          user: { select: { email: true, fullName: true } },
          supplier: true,
          design: true,
        },
      });

      await this.prisma.orderStatusHistory.create({
        data: {
          orderId: created.id,
          fromStatus: null,
          toStatus: created.status,
          note: 'Order created',
          updatedByUserId: userId,
        },
      });

      return created;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new BadRequestException(
          'Order could not be created: check that a supplier is selected and your design is saved. If this persists, ensure the API database is migrated (run Prisma migrate in the server folder).',
        );
      }
      throw e;
    }
  }

  async findAll() {
    const orders = await this.prisma.order.findMany({
      include: {
        user: true,
        supplier: true,
        design: true,
      },
    });
    return orders.map((order) => ({
      ...order,
      shippingAddress: order.shippingAddress ? JSON.parse(order.shippingAddress) : null,
      extraCharges: order.extraCharges ? JSON.parse(order.extraCharges) : null,
    }));
  }

  async findVisibleOrders(user: { id: string; roles: string[] }) {
    if (user.roles.includes('admin')) {
      return this.findAll();
    }

    if (user.roles.includes('supplier')) {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
      if (!supplier) return [];
      // A supplier only ever sees PLACED+ orders routed to their company
      // (DRAFTs are customers' unsubmitted carts).
      const orders = await this.prisma.order.findMany({
        where: { supplierId: supplier.id, status: { not: ORDER_STATUS.DRAFT } },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, fullName: true } },
          supplier: true,
          design: true,
        },
      });
      return orders.map((order) => {
        const shipping = order.shippingAddress ? JSON.parse(order.shippingAddress) : null;
        return {
          ...order,
          shippingAddress: shipping,
          extraCharges: order.extraCharges ? JSON.parse(order.extraCharges) : null,
          // Contact both ways: the supplier can reach the buyer, and the buyer's
          // view (below) can reach the supplier.
          buyerContact: this.buildBuyerContact(order.user, shipping),
          canManage: true,
          visibility: 'fulfillment' as const,
        };
      });
    }

    return this.findByUser(user.id);
  }

  async findByUser(userId: string) {
    const userOrders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        design: true,
        supplier: true,
      },
    });
    return userOrders.map((order) => ({
      ...order,
      shippingAddress: order.shippingAddress ? JSON.parse(order.shippingAddress) : null,
      extraCharges: order.extraCharges ? JSON.parse(order.extraCharges) : null,
      // So the customer can contact the supplier who is fulfilling their order.
      supplierContact: this.buildSupplierContact(order.supplier),
    }));
  }

  async updateStatus(
    id: string,
    updateOrderStatusDto: UpdateOrderStatusDto,
    user: { id: string; roles: string[] },
  ) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    let actingSupplier: { id: string; hasOwnProduction: boolean } | null = null;
    if (user.roles.includes('admin')) {
      // ok
    } else if (user.roles.includes('supplier')) {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
      if (!supplier || order.supplierId !== supplier.id) {
        throw new ForbiddenException('You can only update orders fulfilled by you');
      }
      actingSupplier = supplier;
    } else if (order.userId !== user.id) {
      throw new ForbiddenException();
    }

    const nextStatus = this.normalizeStatus(updateOrderStatusDto.status);
    this.validateTransition(order.status, nextStatus);

    // Production gate: a supplier without its own production must place a
    // wholesale order for this customer order before production can start.
    // (Suppliers with production are unaffected; drop-ship counts as fulfilment.)
    if (
      actingSupplier &&
      !actingSupplier.hasOwnProduction &&
      nextStatus === ORDER_STATUS.IN_PRODUCTION
    ) {
      const wholesaleOrder = await this.prisma.wholesaleOrder.findFirst({
        where: {
          sourceOrderId: order.id,
          buyerSupplierId: actingSupplier.id,
          status: { not: 'CANCELLED' },
        },
        select: { id: true },
      });
      if (!wholesaleOrder) {
        throw new BadRequestException({
          message:
            'You have no in-house production, so this order must be produced by your wholesaler. Place a wholesale order for it first, then start production.',
          code: 'WHOLESALE_ORDER_REQUIRED',
          orderId: order.id,
        });
      }
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        status: nextStatus,
        paymentStatus: updateOrderStatusDto.paymentStatus,
        shippingAddress: updateOrderStatusDto.shippingAddress
          ? JSON.stringify(updateOrderStatusDto.shippingAddress)
          : undefined,
        extraCharges: updateOrderStatusDto.extraCharges
          ? JSON.stringify(updateOrderStatusDto.extraCharges)
          : undefined,
        totalPrice: updateOrderStatusDto.totalPrice,
        shippedAt: nextStatus === ORDER_STATUS.SHIPPED ? new Date() : undefined,
        deliveredAt: nextStatus === ORDER_STATUS.DELIVERED ? new Date() : undefined,
      },
    });

    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: nextStatus,
        note: updateOrderStatusDto.note,
        updatedByUserId: user.id,
      },
    });

    // Notify the customer on the key status transitions.
    if (nextStatus === ORDER_STATUS.ACCEPTED) {
      await this.notifyCustomer(order.userId, 'accepted', updatedOrder);
    } else if (nextStatus === ORDER_STATUS.IN_PRODUCTION) {
      await this.notifyCustomer(order.userId, 'production', updatedOrder);
    } else if (nextStatus === ORDER_STATUS.DELIVERED) {
      await this.notifyCustomer(order.userId, 'delivered', updatedOrder);
    }

    return updatedOrder;
  }

  /** Load the customer and send a lifecycle email (best-effort). */
  private async notifyCustomer(
    userId: string,
    kind: 'accepted' | 'production' | 'delivered' | 'shipped',
    order: { id: string; quantity: number; totalPrice: number; currency: string | null },
    shipment?: { courier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null; estimatedDelivery?: Date | null },
  ) {
    const u = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true },
    });
    if (!u?.email) return;
    const info = { id: order.id, quantity: order.quantity, totalPrice: order.totalPrice, currency: order.currency };
    if (kind === 'delivered') await this.email.orderDelivered(u.email, u.fullName, info);
    else if (kind === 'accepted') await this.email.orderAccepted(u.email, u.fullName, info);
    else if (kind === 'production') await this.email.productionStarted(u.email, u.fullName, info);
    else await this.email.orderShipped(u.email, u.fullName, info, shipment || {});
  }

  async updateShipment(id: string, dto: UpdateShipmentDto, user: { id: string; roles: string[] }) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (user.roles.includes('admin')) {
      // ok
    } else if (user.roles.includes('supplier')) {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
      if (!supplier || order.supplierId !== supplier.id) {
        throw new ForbiddenException('You can only update shipment for your orders');
      }
    } else {
      throw new ForbiddenException('Only supplier/admin can update shipment');
    }

    const hasTrackingUpdate = Boolean(dto.trackingNumber || dto.trackingUrl || dto.courier);
    const nextStatus =
      hasTrackingUpdate && order.status !== ORDER_STATUS.SHIPPED && order.status !== ORDER_STATUS.DELIVERED
        ? ORDER_STATUS.SHIPPED
        : null;

    if (nextStatus) {
      this.validateTransition(order.status, nextStatus);
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        trackingNumber: dto.trackingNumber ?? undefined,
        trackingUrl: dto.trackingUrl ?? undefined,
        courier: dto.courier ?? undefined,
        estimatedDelivery: dto.estimatedDelivery ? new Date(dto.estimatedDelivery) : undefined,
        status: nextStatus ?? undefined,
        shippedAt: nextStatus === ORDER_STATUS.SHIPPED ? new Date() : undefined,
      },
    });

    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: nextStatus ?? order.status,
        note: dto.note || 'Shipment details updated',
        updatedByUserId: user.id,
      },
    });

    if (nextStatus === ORDER_STATUS.SHIPPED) {
      await this.notifyCustomer(order.userId, 'shipped', updatedOrder, {
        courier: updatedOrder.courier,
        trackingNumber: updatedOrder.trackingNumber,
        trackingUrl: updatedOrder.trackingUrl,
        estimatedDelivery: updatedOrder.estimatedDelivery,
      });
    }

    return updatedOrder;
  }

  async updateBulk(dto: BulkOrderUpdateDto, user: { id: string; roles: string[] }) {
    // Scope the bulk mutation to orders the actor may manage: admins can touch
    // any order; a supplier only their fulfilled orders. This prevents an
    // authenticated user from editing arbitrary orders by id.
    let scope: Prisma.OrderWhereInput = { id: { in: dto.orderIds } };
    if (!user.roles.includes('admin')) {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
      if (!supplier) {
        throw new ForbiddenException('Only a supplier or admin can bulk-update orders');
      }
      scope = { ...scope, supplierId: supplier.id };
    }

    const result = await this.prisma.order.updateMany({
      where: scope,
      data: {
        shippingAddress: dto.shippingAddress ? JSON.stringify(dto.shippingAddress) : undefined,
        extraCharges: dto.extraCharges ? JSON.stringify(dto.extraCharges) : undefined,
      },
    });
    return { updated: result.count };
  }

  async getTimeline(orderId: string, user: { id: string; roles: string[] }) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (user.roles.includes('admin')) {
      // Allowed
    } else if (user.roles.includes('supplier')) {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
      if (!supplier || order.supplierId !== supplier.id) {
        throw new ForbiddenException('You can only view timeline for your orders');
      }
    } else if (order.userId !== user.id) {
      throw new ForbiddenException();
    }

    return this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deleteDraft(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException();
    if (order.status !== ORDER_STATUS.DRAFT) {
      throw new BadRequestException('Only DRAFT orders can be deleted');
    }
    await this.prisma.order.delete({ where: { id: orderId } });
    return { success: true };
  }

  async getTracking(orderId: string, user: { id: string; roles: string[] }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        supplierId: true,
        status: true,
        trackingNumber: true,
        trackingUrl: true,
        courier: true,
        estimatedDelivery: true,
        shippedAt: true,
        deliveredAt: true,
        createdAt: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (user.roles.includes('admin')) {
      // Allowed
    } else if (user.roles.includes('supplier')) {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
      if (!supplier || order.supplierId !== supplier.id) {
        throw new ForbiddenException('You can only view tracking for your orders');
      }
    } else if (order.userId !== user.id) {
      throw new ForbiddenException('You can only view tracking for your own orders');
    }

    return {
      orderId: order.id,
      status: order.status,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      courier: order.courier,
      estimatedDelivery: order.estimatedDelivery,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      createdAt: order.createdAt,
    };
  }
}
