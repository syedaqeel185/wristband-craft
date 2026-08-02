import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { effectiveOptions } from '../pricing/product-options';

export type Currency = 'USD' | 'EUR' | 'GBP';
export type FulfilmentMode = 'SHIP_TO_SUPPLIER' | 'DROP_SHIP';

/** Days from the supplier's payment to promised delivery. */
export const PRODUCTION_SLA_DAYS = 7;

export interface EupQuoteLine {
  code: string;
  label: string;
  kind: 'per_1000' | 'per_unit' | 'flat';
  /** Rate before multiplying out — per 1000 pcs, per unit, or the flat amount. */
  rate: number;
  amount: number;
}

export interface EupQuote {
  currency: Currency;
  quantity: number;
  /** The fixed EUP price per 1000 pcs in force for this supplier + product. */
  pricePer1000: number;
  priceSource: 'supplier' | 'default';
  goodsTotal: number;
  freightTotal: number;
  freightRateId: string | null;
  freightLabel: string | null;
  estMinDays: number | null;
  estMaxDays: number | null;
  total: number;
  /** Cost normalised per 1000 pcs including freight — the number EUP quotes. */
  effectivePer1000: number;
  lines: EupQuoteLine[];
}

type PriceRow = {
  id: string;
  supplierId: string | null;
  pricePer1000Eur: number;
  pricePer1000Usd: number | null;
  pricePer1000Gbp: number | null;
};

type FreightRow = {
  id: string;
  supplierId: string | null;
  countryCode: string | null;
  fulfilmentMode: string;
  label: string | null;
  pricePer1000Eur: number;
  pricePer1000Usd: number | null;
  pricePer1000Gbp: number | null;
  minChargeEur: number | null;
  minChargeUsd: number | null;
  minChargeGbp: number | null;
  freeOverQty: number | null;
  estMinDays: number | null;
  estMaxDays: number | null;
};

/**
 * What a supplier pays EUP.
 *
 * EUP sets a fixed price per 1000 pcs per product, optionally overridden per
 * supplier, and freight is charged on top. Nothing here is derived from the
 * supplier's own retail price list, and there are no price constants in code —
 * every number comes from a row EUP entered in its console.
 *
 * Add-on options (print, QR, RFID, …) are priced from the product's own
 * `product_options`, which belong to EUP because EUP owns the product record.
 */
@Injectable()
export class EupPricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Per-currency amount for an EUP-entered price. EUR is the required column
   * (EUP prices in euro), so it is the fallback rather than USD.
   */
  private inCurrency(
    currency: Currency,
    amounts: { eur: number; usd?: number | null; gbp?: number | null },
  ): number {
    if (currency === 'USD' && amounts.usd != null) return amounts.usd;
    if (currency === 'GBP' && amounts.gbp != null) return amounts.gbp;
    return amounts.eur;
  }

  // ---- Price resolution ----------------------------------------------------

  /**
   * The price rows in force right now for a set of products — supplier-specific
   * where one exists, else EUP's default row. Products with neither resolve to
   * nothing and are not orderable by that supplier.
   */
  async resolvePrices(
    wholesalerId: string,
    supplierId: string,
    productIds?: string[],
  ): Promise<Map<string, { row: PriceRow; source: 'supplier' | 'default' }>> {
    const now = new Date();
    const rows = await this.prisma.eupPrice.findMany({
      where: {
        wholesalerId,
        isActive: true,
        OR: [{ supplierId }, { supplierId: null }],
        ...(productIds ? { productId: { in: productIds } } : {}),
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
    });

    const byProduct = new Map<string, { row: PriceRow; source: 'supplier' | 'default' }>();
    for (const row of rows) {
      const source = row.supplierId === supplierId ? 'supplier' : 'default';
      const existing = byProduct.get(row.productId);
      // A supplier-specific row always beats the default row.
      if (!existing || (source === 'supplier' && existing.source === 'default')) {
        byProduct.set(row.productId, { row, source });
      }
    }
    return byProduct;
  }

  async resolvePrice(wholesalerId: string, supplierId: string, productId: string) {
    const map = await this.resolvePrices(wholesalerId, supplierId, [productId]);
    return map.get(productId) ?? null;
  }

  // ---- Freight resolution --------------------------------------------------

  /**
   * The freight rate that applies, picking the most specific active row:
   * supplier + country + mode  >  supplier + mode  >  country + mode  >  any.
   * An exact fulfilment-mode match outranks a row set to ANY. No match means
   * EUP charges no freight for that combination.
   */
  async resolveFreightRate(
    wholesalerId: string,
    supplierId: string,
    fulfilmentMode: FulfilmentMode,
    countryCode?: string | null,
  ): Promise<FreightRow | null> {
    const rows = await this.prisma.eupFreightRate.findMany({
      where: {
        wholesalerId,
        isActive: true,
        OR: [{ supplierId }, { supplierId: null }],
        AND: [{ OR: [{ fulfilmentMode }, { fulfilmentMode: 'ANY' }] }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const cc = countryCode?.toUpperCase() || null;
    const eligible = rows.filter((r) => !r.countryCode || r.countryCode.toUpperCase() === cc);
    if (!eligible.length) return null;

    const score = (r: FreightRow) =>
      (r.supplierId ? 4 : 0) +
      (r.countryCode ? 2 : 0) +
      (r.fulfilmentMode !== 'ANY' ? 1 : 0);

    return eligible.reduce((best, r) => (score(r) > score(best) ? r : best), eligible[0]);
  }

  private freightAmount(rate: FreightRow, quantity: number, currency: Currency): number {
    if (rate.freeOverQty != null && quantity >= rate.freeOverQty) return 0;
    const per1000 = this.inCurrency(currency, {
      eur: rate.pricePer1000Eur,
      usd: rate.pricePer1000Usd,
      gbp: rate.pricePer1000Gbp,
    });
    const raw = (quantity / 1000) * per1000;
    const minCharge = this.inCurrency(currency, {
      eur: rate.minChargeEur ?? 0,
      usd: rate.minChargeUsd,
      gbp: rate.minChargeGbp,
    });
    return this.round2(Math.max(raw, minCharge));
  }

  // ---- Quote ---------------------------------------------------------------

  /**
   * Full breakdown of what a supplier pays EUP: goods (fixed price per 1000 pcs
   * plus any selected add-ons) and freight, kept as separate totals so the
   * supplier always sees which is which.
   */
  async quote(input: {
    wholesalerId: string;
    supplierId: string;
    product: Parameters<typeof effectiveOptions>[0] & { id: string; name: string; minOrderQuantity: number; maxOrderQuantity?: number | null };
    quantity: number;
    currency: Currency;
    selectedOptions?: Array<{ key: string; choiceKey?: string }>;
    fulfilmentMode: FulfilmentMode;
    destinationCountryCode?: string | null;
  }): Promise<EupQuote> {
    const { wholesalerId, supplierId, product, quantity, currency, fulfilmentMode } = input;

    if (quantity < product.minOrderQuantity) {
      throw new BadRequestException(
        `Minimum order quantity for ${product.name} is ${product.minOrderQuantity}`,
      );
    }
    if (product.maxOrderQuantity != null && quantity > product.maxOrderQuantity) {
      throw new BadRequestException(
        `Maximum order quantity for ${product.name} is ${product.maxOrderQuantity}`,
      );
    }

    const resolved = await this.resolvePrice(wholesalerId, supplierId, product.id);
    if (!resolved) {
      throw new BadRequestException({
        message: `EUP has not set your price for ${product.name} yet. Contact EUP to have this product priced for your account.`,
        code: 'EUP_PRICE_NOT_SET',
        productId: product.id,
      });
    }

    const pricePer1000 = this.inCurrency(currency, {
      eur: resolved.row.pricePer1000Eur,
      usd: resolved.row.pricePer1000Usd,
      gbp: resolved.row.pricePer1000Gbp,
    });

    const lines: EupQuoteLine[] = [
      {
        code: 'base',
        label: `${product.name} — EUP price per 1000 pcs`,
        kind: 'per_1000',
        rate: pricePer1000,
        amount: this.round2((quantity / 1000) * pricePer1000),
      },
    ];

    // Add-ons are priced from EUP's own product options.
    const options = effectiveOptions(product);
    const byKey = new Map(options.map((o) => [o.key, o]));
    const seen = new Set<string>();

    for (const sel of input.selectedOptions ?? []) {
      if (!sel?.key || seen.has(sel.key)) continue;
      seen.add(sel.key);
      const option = byKey.get(sel.key);
      if (!option || !option.isActive) continue; // unknown/disabled keys are never priced

      const choice = sel.choiceKey ? option.choices?.find((c) => c.key === sel.choiceKey) : undefined;
      const src =
        choice && choice.priceUsd != null
          ? { usd: choice.priceUsd, eur: choice.priceEur, gbp: choice.priceGbp }
          : { usd: option.priceUsd, eur: option.priceEur, gbp: option.priceGbp };
      // Option prices keep USD as their required column (they predate EUP pricing).
      const unit =
        currency === 'EUR' && src.eur != null
          ? src.eur
          : currency === 'GBP' && src.gbp != null
            ? src.gbp
            : (src.usd ?? 0);
      if (unit <= 0) continue;

      const label = choice ? `${option.label} — ${choice.label}` : option.label;
      lines.push(
        option.pricingMode === 'one_time'
          ? { code: option.key, label, kind: 'flat', rate: unit, amount: this.round2(unit) }
          : { code: option.key, label, kind: 'per_unit', rate: unit, amount: this.round2(unit * quantity) },
      );
    }

    const goodsTotal = this.round2(lines.reduce((sum, l) => sum + l.amount, 0));

    const rate = await this.resolveFreightRate(
      wholesalerId,
      supplierId,
      fulfilmentMode,
      input.destinationCountryCode,
    );
    const freightTotal = rate ? this.freightAmount(rate, quantity, currency) : 0;
    if (rate && freightTotal > 0) {
      lines.push({
        code: 'freight',
        label: rate.label || 'Freight',
        kind: 'per_1000',
        rate: this.inCurrency(currency, {
          eur: rate.pricePer1000Eur,
          usd: rate.pricePer1000Usd,
          gbp: rate.pricePer1000Gbp,
        }),
        amount: freightTotal,
      });
    }

    const total = this.round2(goodsTotal + freightTotal);

    return {
      currency,
      quantity,
      pricePer1000,
      priceSource: resolved.source,
      goodsTotal,
      freightTotal,
      freightRateId: rate?.id ?? null,
      freightLabel: rate?.label ?? null,
      estMinDays: rate?.estMinDays ?? null,
      estMaxDays: rate?.estMaxDays ?? null,
      total,
      effectivePer1000: quantity > 0 ? this.round3((total / quantity) * 1000) : 0,
      lines,
    };
  }

  private round2(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100;
  }
  private round3(v: number): number {
    return Math.round((v + Number.EPSILON) * 1000) / 1000;
  }
}
