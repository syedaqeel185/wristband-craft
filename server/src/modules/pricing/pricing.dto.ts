import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const PRINT_TYPES = ['none', 'black', 'color'] as const;
export type PrintType = (typeof PRINT_TYPES)[number];

/** One customization option the customer selected, by its supplier-defined key. */
export class SelectedOptionDto {
  @IsString()
  key!: string;

  /** Sub-choice within the option (e.g. qr_code → dynamic_qr). */
  @IsOptional()
  @IsString()
  choiceKey?: string;
}

/**
 * Input to the dynamic pricing engine. `selectedOptions` references the
 * supplier-configured option keys on the product and is the preferred way to
 * request add-ons; the boolean flags below are kept for backward compatibility
 * and are mapped onto the equivalent option keys when `selectedOptions` is
 * not provided.
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

  /** Supplier-configured options selected by the customer (preferred). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedOptionDto)
  selectedOptions?: SelectedOptionDto[];
}
