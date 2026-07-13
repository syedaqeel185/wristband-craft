import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Currency = 'USD' | 'EUR' | 'GBP';

/** Columns a supplier may set on a ShippingRate (prevents mass-assignment). */
const RATE_WRITABLE_FIELDS = [
  'courier',
  'label',
  'freeOverQty',
  'estMinDays',
  'estMaxDays',
  'isActive',
  'isDefault',
  'sortOrder',
] as const;

const TIER_WRITABLE_FIELDS = [
  'minQuantity',
  'maxQuantity',
  'priceEur',
  'priceUsd',
  'priceGbp',
] as const;

function pick<T extends Record<string, any>>(source: T, fields: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of fields) {
    if (source != null && source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

export interface ShippingQuote {
  courier: string;
  label: string | null;
  cost: number;
  estMinDays: number | null;
  estMaxDays: number | null;
  /** True when no courier is configured and the platform DHL default was used. */
  isFallback: boolean;
}

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  private async supplierIdFor(userId: string): Promise<string> {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId }, select: { id: true } });
    if (!supplier) throw new BadRequestException('Not a supplier');
    return supplier.id;
  }

  private sanitizeTiers(tiers: any[]): Record<string, any>[] {
    return (Array.isArray(tiers) ? tiers : [])
      .map((t) => pick(t, TIER_WRITABLE_FIELDS))
      .map((t) => ({
        ...t,
        minQuantity: Math.max(1, Math.round(Number(t.minQuantity) || 1)),
        maxQuantity: t.maxQuantity == null || t.maxQuantity === '' ? null : Math.round(Number(t.maxQuantity)),
        priceEur: Number(t.priceEur) || 0,
        priceUsd: t.priceUsd == null || t.priceUsd === '' ? null : Number(t.priceUsd),
        priceGbp: t.priceGbp == null || t.priceGbp === '' ? null : Number(t.priceGbp),
      }));
  }

  /** Supplier's own couriers (all, including inactive) for the management UI. */
  async listMine(userId: string) {
    const supplierId = await this.supplierIdFor(userId);
    return this.prisma.shippingRate.findMany({
      where: { supplierId },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { tiers: { orderBy: { minQuantity: 'asc' } } },
    });
  }

  /** Public: a supplier's active couriers (for the storefront + checkout display). */
  async listForSupplier(supplierId: string) {
    return this.prisma.shippingRate.findMany({
      where: { supplierId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { tiers: { orderBy: { minQuantity: 'asc' } } },
    });
  }

  async create(userId: string, dto: any) {
    const supplierId = await this.supplierIdFor(userId);
    if (!dto?.courier?.trim()) throw new BadRequestException('Courier name is required');

    const data = pick(dto, RATE_WRITABLE_FIELDS);
    const tiers = this.sanitizeTiers(dto.tiers);
    if (tiers.length === 0) throw new BadRequestException('Add at least one rate tier');

    // Only one default per supplier.
    if (data.isDefault) {
      await this.prisma.shippingRate.updateMany({ where: { supplierId }, data: { isDefault: false } });
    }

    const rate = await this.prisma.shippingRate.create({
      data: {
        ...data,
        supplierId,
        tiers: { create: tiers as Prisma.ShippingRateTierCreateWithoutShippingRateInput[] },
      } as Prisma.ShippingRateUncheckedCreateInput,
      include: { tiers: { orderBy: { minQuantity: 'asc' } } },
    });
    await this.ensureOneDefault(supplierId);
    return rate;
  }

  async update(userId: string, id: string, dto: any) {
    const supplierId = await this.supplierIdFor(userId);
    const existing = await this.prisma.shippingRate.findFirst({ where: { id, supplierId } });
    if (!existing) throw new BadRequestException('Courier not found');

    const data = pick(dto, RATE_WRITABLE_FIELDS);
    if (data.isDefault) {
      await this.prisma.shippingRate.updateMany({
        where: { supplierId, id: { not: id } },
        data: { isDefault: false },
      });
    }

    await this.prisma.shippingRate.update({ where: { id }, data });

    if (Array.isArray(dto.tiers)) {
      const tiers = this.sanitizeTiers(dto.tiers);
      if (tiers.length === 0) throw new BadRequestException('Add at least one rate tier');
      await this.prisma.shippingRateTier.deleteMany({ where: { shippingRateId: id } });
      await this.prisma.shippingRateTier.createMany({
        data: tiers.map((t) => ({ ...t, shippingRateId: id })) as Prisma.ShippingRateTierCreateManyInput[],
      });
    }
    await this.ensureOneDefault(supplierId);

    return this.prisma.shippingRate.findUnique({
      where: { id },
      include: { tiers: { orderBy: { minQuantity: 'asc' } } },
    });
  }

  async remove(userId: string, id: string) {
    const supplierId = await this.supplierIdFor(userId);
    const existing = await this.prisma.shippingRate.findFirst({ where: { id, supplierId } });
    if (!existing) throw new BadRequestException('Courier not found');
    await this.prisma.shippingRate.delete({ where: { id } });
    await this.ensureOneDefault(supplierId);
    return { success: true };
  }

  /** Guarantee a supplier always has exactly one default among active couriers. */
  private async ensureOneDefault(supplierId: string) {
    const active = await this.prisma.shippingRate.findMany({
      where: { supplierId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, isDefault: true },
    });
    if (active.length === 0) return;
    if (!active.some((r) => r.isDefault)) {
      await this.prisma.shippingRate.update({ where: { id: active[0].id }, data: { isDefault: true } });
    }
  }

  private priceForCurrency(
    tier: { priceEur: number; priceUsd: number | null; priceGbp: number | null },
    currency: Currency,
  ): number {
    if (currency === 'USD') return tier.priceUsd ?? tier.priceEur;
    if (currency === 'GBP') return tier.priceGbp ?? tier.priceEur;
    return tier.priceEur;
  }

  /** Platform default when a supplier hasn't configured any courier (ported DHL tiers, EUR). */
  private fallback(totalQty: number): ShippingQuote {
    let cost = 0;
    if (totalQty > 0) cost = totalQty <= 5000 ? 23 : totalQty <= 10000 ? 35 : 49;
    return { courier: 'DHL', label: 'Standard delivery', cost, estMinDays: 3, estMaxDays: 7, isFallback: true };
  }

  /**
   * Authoritative shipping cost for a single supplier's shipment. Picks the
   * default active courier, applies the free-over-quantity threshold, then
   * resolves the quantity tier. Falls back to the platform DHL rate when the
   * supplier has configured nothing, so shipping is never silently €0.
   */
  async computeShipping(supplierId: string, totalQty: number, currency: Currency = 'EUR'): Promise<ShippingQuote> {
    const rates = await this.listForSupplier(supplierId);
    if (rates.length === 0) return this.fallback(totalQty);

    const rate = rates[0]; // already ordered default-first
    if (rate.freeOverQty != null && totalQty >= rate.freeOverQty) {
      return { courier: rate.courier, label: rate.label, cost: 0, estMinDays: rate.estMinDays, estMaxDays: rate.estMaxDays, isFallback: false };
    }

    const tiers = [...rate.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
    // Highest tier whose minQuantity <= qty; if qty is below the smallest, use the smallest.
    let chosen = tiers.find((t) => t.minQuantity <= totalQty && (t.maxQuantity == null || totalQty <= t.maxQuantity));
    if (!chosen) {
      const atOrBelow = tiers.filter((t) => t.minQuantity <= totalQty);
      chosen = atOrBelow.length ? atOrBelow[atOrBelow.length - 1] : tiers[0];
    }

    return {
      courier: rate.courier,
      label: rate.label,
      cost: chosen ? this.priceForCurrency(chosen, currency) : 0,
      estMinDays: rate.estMinDays,
      estMaxDays: rate.estMaxDays,
      isFallback: false,
    };
  }
}
