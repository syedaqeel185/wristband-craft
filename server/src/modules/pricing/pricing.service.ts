import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Currency, QuoteRequestDto } from './pricing.dto';

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
      include: { pricingTiers: { orderBy: { minQuantity: 'asc' } } },
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

    // 2) Print add-on (USD-only fields; applied as the amount in the chosen currency).
    if (req.printType === 'color' && product.colorPrintExtraUsd > 0) {
      components.push(
        this.perUnit(
          'print_color',
          'Full-colour print',
          product.colorPrintExtraUsd,
          quantity,
        ),
      );
    } else if (req.printType === 'black' && product.printExtraUsd > 0) {
      components.push(
        this.perUnit(
          'print_black',
          'Black print',
          product.printExtraUsd,
          quantity,
        ),
      );
    }

    // 3) Logo printing add-on (per unit).
    if (req.hasLogo && product.logoExtraUsd > 0) {
      components.push(
        this.perUnit('logo', 'Logo printing', product.logoExtraUsd, quantity),
      );
    }

    // 4) QR code add-on (per unit).
    if (req.qrEnabled) {
      const qrUnit = this.resolve(currency, {
        usd: product.qrCodePriceUsd,
        eur: product.qrCodePriceEur,
        gbp: product.qrCodePriceGbp,
      });
      if (qrUnit > 0)
        components.push(this.perUnit('qr_code', 'QR code', qrUnit, quantity));
    }

    // 5) Design setup — one-time flat fee.
    if (req.hasCustomDesign) {
      const designFee = this.resolve(currency, {
        usd: product.designSetupFeeUsd,
        eur: product.designSetupFeeEur,
        gbp: product.designSetupFeeGbp,
      });
      if (designFee > 0)
        components.push(
          this.flat('design_setup', 'Custom design setup', designFee),
        );
    }

    // 6) Trademark / branding — one-time flat fee.
    if (req.trademarkEnabled) {
      const tmFee = this.resolve(currency, {
        usd: product.trademarkFeeUsd,
        eur: product.trademarkFeeEur,
        gbp: product.trademarkFeeGbp,
      });
      if (tmFee > 0)
        components.push(this.flat('trademark', 'Trademark / branding', tmFee));
    }

    const perUnitComponents = components.filter((c) => c.kind === 'per_unit');
    const flatComponents = components.filter((c) => c.kind === 'flat');

    const unitPrice = this.round(
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
      unitAmount: this.round(unitAmount),
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
