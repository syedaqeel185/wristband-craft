import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Currency, QuoteRequestDto, SelectedOptionDto } from './pricing.dto';
import { effectiveOptions, LEGACY_OPTION_KEYS } from './product-options';

/**
 * A single line in a price breakdown. `kind` distinguishes per-unit charges
 * (multiplied by quantity) from one-time flat fees, so the UI can render the
 * math transparently and future options slot in without special-casing.
 */
export interface PriceComponent {
  code: string;
  label: string;
  kind: 'per_unit' | 'flat';
  /** Amount of a single unit (per_unit) or the whole fee (flat). */
  unitAmount: number;
  /** Quantity the unitAmount is multiplied by (1 for flat fees). */
  quantity: number;
  /** unitAmount * quantity, rounded to cents. */
  amount: number;
}

export interface PriceQuote {
  productId: string;
  currency: Currency;
  quantity: number;
  /** Per-unit price including per-unit add-ons (excludes flat fees). */
  unitPrice: number;
  /** unitPrice * quantity. */
  lineSubtotal: number;
  /** Sum of one-time flat fees. */
  flatFees: number;
  /** Grand total = lineSubtotal + flatFees. */
  total: number;
  components: PriceComponent[];
}

type CurrencyAmounts = {
  usd: number;
  eur?: number | null;
  gbp?: number | null;
};

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /** Per-unit prices keep 3 decimals (suppliers price in mills, e.g. €0.018/unit). */
  private round3(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }

  /**
   * Resolve a per-currency amount, falling back to the USD value when a
   * currency-specific override is not configured. Returns 0 for empty inputs.
   */
  private resolve(currency: Currency, amounts: CurrencyAmounts): number {
    if (currency === 'EUR' && amounts.eur != null) return amounts.eur;
    if (currency === 'GBP' && amounts.gbp != null) return amounts.gbp;
    return amounts.usd ?? 0;
  }

  /**
   * Compute an authoritative price quote for a product + customization options.
   * This is the single source of truth for pricing — clients may preview it via
   * the quote endpoint, but order totals should always be (re)computed here.
   */
  async quote(req: QuoteRequestDto): Promise<PriceQuote> {
    const currency = req.currency ?? 'USD';
    const quantity = Math.round(req.quantity);

    const product = await this.prisma.product.findUnique({
      where: { id: req.productId },
      include: {
        pricingTiers: { orderBy: { minQuantity: 'asc' } },
        options: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (!product.isActive) {
      throw new BadRequestException('Product is not available for ordering');
    }
    if (quantity < product.minOrderQuantity) {
      throw new BadRequestException(
        `Minimum order quantity for this product is ${product.minOrderQuantity}`,
      );
    }
    if (
      product.maxOrderQuantity != null &&
      quantity > product.maxOrderQuantity
    ) {
      throw new BadRequestException(
        `Maximum order quantity for this product is ${product.maxOrderQuantity}`,
      );
    }

    const components: PriceComponent[] = [];

    // 1) Base unit price — quantity tier if one matches, else the product base.
    const tier = product.pricingTiers.find(
      (t) =>
        quantity >= t.minQuantity &&
        (t.maxQuantity == null || quantity <= t.maxQuantity),
    );
    const baseUnit = tier
      ? this.resolve(currency, {
          usd: tier.pricePerUnitUsd,
          eur: tier.pricePerUnitEur,
          gbp: tier.pricePerUnitGbp,
        })
      : this.resolve(currency, {
          usd: product.priceUsd,
          eur: product.priceEur,
          gbp: product.priceGbp,
        });
    components.push(
      this.perUnit(
        'base',
        tier ? `Base price (qty tier ${tier.minQuantity}+)` : 'Base price',
        baseUnit,
        quantity,
      ),
    );

    // 2) Customization add-ons — driven entirely by the supplier's configured
    //    options for this product (persisted rows, or the legacy-column
    //    synthesis for products that haven't been re-saved yet).
    const options = effectiveOptions(product);
    const selections = this.normalizeSelections(req);
    const optionByKey = new Map(options.map((o) => [o.key, o]));

    for (const sel of selections) {
      const option = optionByKey.get(sel.key);
      if (!option || !option.isActive) continue; // unknown/disabled keys are ignored, never priced

      const choice = sel.choiceKey
        ? option.choices?.find((c) => c.key === sel.choiceKey)
        : undefined;
      // A choice with its own price overrides the option's base price.
      const unit =
        choice && choice.priceUsd != null
          ? this.resolve(currency, {
              usd: choice.priceUsd,
              eur: choice.priceEur,
              gbp: choice.priceGbp,
            })
          : this.resolve(currency, {
              usd: option.priceUsd,
              eur: option.priceEur,
              gbp: option.priceGbp,
            });
      if (unit <= 0) continue;

      const label = choice ? `${option.label} — ${choice.label}` : option.label;
      if (option.pricingMode === 'one_time') {
        components.push(this.flat(option.key, label, unit));
      } else {
        components.push(this.perUnit(option.key, label, unit, quantity));
      }
    }

    const perUnitComponents = components.filter((c) => c.kind === 'per_unit');
    const flatComponents = components.filter((c) => c.kind === 'flat');

    const unitPrice = this.round3(
      perUnitComponents.reduce((sum, c) => sum + c.unitAmount, 0),
    );
    const lineSubtotal = this.round(unitPrice * quantity);
    const flatFees = this.round(
      flatComponents.reduce((sum, c) => sum + c.amount, 0),
    );
    const total = this.round(lineSubtotal + flatFees);

    return {
      productId: product.id,
      currency,
      quantity,
      unitPrice,
      lineSubtotal,
      flatFees,
      total,
      components,
    };
  }

  /**
   * Turn a quote request into a list of selected option keys. Prefers the
   * explicit `selectedOptions` array; falls back to mapping the legacy boolean
   * flags onto the well-known default option keys so older clients (and stored
   * cart/order snapshots) keep pricing identically.
   */
  private normalizeSelections(req: QuoteRequestDto): SelectedOptionDto[] {
    if (Array.isArray(req.selectedOptions)) {
      const seen = new Set<string>();
      return req.selectedOptions.filter((s) => {
        if (!s || typeof s.key !== 'string' || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      });
    }

    const selections: SelectedOptionDto[] = [];
    if (req.printType === 'color') selections.push({ key: LEGACY_OPTION_KEYS.fullColorPrint });
    else if (req.printType === 'black') selections.push({ key: LEGACY_OPTION_KEYS.blackPrint });
    if (req.hasLogo) selections.push({ key: LEGACY_OPTION_KEYS.logo });
    if (req.qrEnabled) selections.push({ key: LEGACY_OPTION_KEYS.qrCode });
    if (req.hasCustomDesign) selections.push({ key: LEGACY_OPTION_KEYS.designSetup });
    if (req.trademarkEnabled) selections.push({ key: LEGACY_OPTION_KEYS.trademark });
    return selections;
  }

  private perUnit(
    code: string,
    label: string,
    unitAmount: number,
    quantity: number,
  ): PriceComponent {
    return {
      code,
      label,
      kind: 'per_unit',
      unitAmount: this.round3(unitAmount),
      quantity,
      amount: this.round(unitAmount * quantity),
    };
  }

  private flat(code: string, label: string, amount: number): PriceComponent {
    return {
      code,
      label,
      kind: 'flat',
      unitAmount: this.round(amount),
      quantity: 1,
      amount: this.round(amount),
    };
  }
}
