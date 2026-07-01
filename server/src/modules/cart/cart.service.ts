import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { OrdersService } from '../orders/orders.service';
import { AddCartItemDto, CartCheckoutDto, UpdateCartItemDto } from './cart.dto';

type Currency = 'USD' | 'EUR' | 'GBP';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly orders: OrdersService,
  ) {}

  private async getOrCreateCart(userId: string) {
    const existing = await this.prisma.cart.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.cart.create({ data: { userId } });
  }

  private mapPrintType(opts: Record<string, any>): 'none' | 'black' | 'color' {
    const p = opts?.printType;
    if (p === 'full_color' || p === 'color') return 'color';
    if (p === 'black') return 'black';
    return 'none';
  }

  /** Live, server-computed view of the cart (prices recomputed from PricingService). */
  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      orderBy: { createdAt: 'asc' },
      include: { design: { select: { designUrl: true, wristbandType: true, wristbandColor: true } } },
    });

    const priced = await Promise.all(
      items.map(async (item) => {
        const options = this.parse(item.optionsJson);
        let unitPrice = item.quantity ? item.priceSnapshot / item.quantity : 0;
        let lineTotal = item.priceSnapshot;
        if (item.productId) {
          try {
            const quote = await this.pricing.quote({
              productId: item.productId,
              quantity: item.quantity,
              currency: (item.currency as Currency) || 'EUR',
              printType: this.mapPrintType(options),
              qrEnabled: options.hasQrCode === true,
              trademarkEnabled: options.hasTrademark === true,
              hasCustomDesign: options.hasPrint === true,
              hasLogo: options.hasLogo === true,
            });
            unitPrice = quote.unitPrice;
            lineTotal = quote.total;
          } catch {
            // Product unavailable / below min — fall back to the stored snapshot.
          }
        }
        return {
          id: item.id,
          designId: item.designId,
          productId: item.productId,
          supplierId: item.supplierId,
          quantity: item.quantity,
          currency: item.currency,
          options,
          design: item.design,
          unitPrice,
          lineTotal,
        };
      }),
    );

    const subtotal = priced.reduce((s, i) => s + (i.lineTotal || 0), 0);
    return {
      id: cart.id,
      currency: priced[0]?.currency || 'EUR',
      items: priced,
      subtotal: Math.round(subtotal * 100) / 100,
      count: priced.length,
    };
  }

  private async computeSnapshot(dto: { productId?: string; quantity: number; currency?: string; options?: Record<string, any> }) {
    if (!dto.productId) return 0;
    try {
      const opts = dto.options || {};
      const quote = await this.pricing.quote({
        productId: dto.productId,
        quantity: dto.quantity,
        currency: (dto.currency as Currency) || 'EUR',
        printType: this.mapPrintType(opts),
        qrEnabled: opts.hasQrCode === true,
        trademarkEnabled: opts.hasTrademark === true,
        hasCustomDesign: opts.hasPrint === true,
        hasLogo: opts.hasLogo === true,
      });
      return quote.total;
    } catch {
      return 0;
    }
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    if (dto.designId) {
      const design = await this.prisma.design.findFirst({ where: { id: dto.designId, userId } });
      if (!design) throw new BadRequestException('Design not found');
    }
    const priceSnapshot = await this.computeSnapshot(dto);
    await this.prisma.cartItem.create({
      data: {
        cartId: cart.id,
        designId: dto.designId,
        productId: dto.productId,
        supplierId: dto.supplierId,
        quantity: dto.quantity,
        currency: dto.currency || 'EUR',
        optionsJson: dto.options ? JSON.stringify(dto.options) : undefined,
        priceSnapshot,
      },
    });
    return this.getCart(userId);
  }

  private async ownItemOrThrow(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId }, include: { cart: true } });
    if (!item) throw new NotFoundException('Cart item not found');
    if (item.cart.userId !== userId) throw new ForbiddenException();
    return item;
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.ownItemOrThrow(userId, itemId);
    const quantity = dto.quantity ?? item.quantity;
    const priceSnapshot = await this.computeSnapshot({
      productId: item.productId ?? undefined,
      quantity,
      currency: item.currency,
      options: this.parse(item.optionsJson),
    });
    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity, priceSnapshot } });
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    await this.ownItemOrThrow(userId, itemId);
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCart(userId);
  }

  async clear(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }

  /** Turn cart items into PLACED orders (server-priced) and empty the cart. */
  async checkout(userId: string, dto: CartCheckoutDto) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.prisma.cartItem.findMany({ where: { cartId: cart.id } });
    if (items.length === 0) throw new BadRequestException('Your cart is empty');

    const orderIds: string[] = [];
    for (const [index, item] of items.entries()) {
      const options = this.parse(item.optionsJson);
      const order = await this.orders.create(userId, {
        userId,
        designId: item.designId ?? undefined,
        productId: item.productId ?? undefined,
        supplierId: item.supplierId ?? undefined,
        quantity: item.quantity,
        // Recomputed server-side from the product; this is just a required placeholder.
        totalPrice: item.priceSnapshot,
        currency: item.currency,
        status: 'PLACED',
        paymentStatus: 'pending',
        printType: options.printType,
        customizationNotes: item.optionsJson ?? undefined,
        shippingAddress: dto.shippingAddress,
        // One-time charges (e.g. express delivery) apply to the checkout as a
        // whole, not per line item — only fold them into the first order.
        extraCharges: index === 0 ? dto.extraCharges : undefined,
      });
      orderIds.push(order.id);
    }

    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { orderIds };
  }

  private parse(s?: string | null): Record<string, any> {
    if (!s) return {};
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  }
}
