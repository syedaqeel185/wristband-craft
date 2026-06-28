import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const PRINT_TYPES = ['none', 'black', 'color'] as const;
export type PrintType = (typeof PRINT_TYPES)[number];

/**
 * Input to the dynamic pricing engine. Mirrors the customization options a
 * customer can toggle in the design studio. New options can be added here and
 * handled in {@link PricingService} without touching existing components.
 */
export class QuoteRequestDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: Currency = 'USD';

  @IsOptional()
  @IsIn(PRINT_TYPES)
  printType: PrintType = 'none';

  /** A custom design is applied → one-time design setup fee. */
  @IsOptional()
  @IsBoolean()
  hasCustomDesign?: boolean;

  /** A logo is uploaded → per-unit logo printing add-on. */
  @IsOptional()
  @IsBoolean()
  hasLogo?: boolean;

  /** QR code enabled → per-unit QR add-on. */
  @IsOptional()
  @IsBoolean()
  qrEnabled?: boolean;

  /** Trademark / branding enabled → one-time trademark fee. */
  @IsOptional()
  @IsBoolean()
  trademarkEnabled?: boolean;
}
