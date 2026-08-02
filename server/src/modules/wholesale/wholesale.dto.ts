import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export const FULFILMENT_MODES = ['SHIP_TO_SUPPLIER', 'DROP_SHIP'] as const;

/** One selected customization option (mirrors the pricing engine's shape). */
export class WholesaleSelectedOptionDto {
  @IsString()
  key: string;

  @IsOptional()
  @IsString()
  choiceKey?: string;
}

export class PlaceWholesaleOrderDto {
  @IsString()
  @MinLength(1)
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsIn(['USD', 'EUR', 'GBP'])
  currency?: string;

  @IsOptional()
  @IsArray()
  selectedOptions?: WholesaleSelectedOptionDto[];

  @IsOptional()
  @IsIn(FULFILMENT_MODES as unknown as string[])
  fulfilmentMode?: string;

  /** The customer order this wholesale order fulfils (optional — omit for restock). */
  @IsOptional()
  @IsString()
  sourceOrderId?: string;

  /** End-customer delivery + contact details, required when drop-shipping. */
  @IsOptional()
  @IsObject()
  customerInfo?: Record<string, any>;

  /** The buyer supplier's own delivery address, used when shipping to the supplier. */
  @IsOptional()
  @IsObject()
  shippingAddress?: Record<string, any>;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class WholesaleReceiptDto {
  @IsString()
  provider: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;
}

export class WholesaleConfirmStripeDto {
  @IsString()
  sessionId: string;
}

export class UpdateWholesaleOrderStatusDto {
  @IsIn(['ACCEPTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
  status: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  trackingUrl?: string;

  @IsOptional()
  @IsString()
  courier?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpsertDiscountDto {
  /** null / omitted = the wholesaler's default discount for all suppliers. */
  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @IsNumber()
  @Min(0)
  @Max(100)
  percent: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertOfferDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minQuantity?: number;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetProductionDto {
  @IsBoolean()
  hasOwnProduction: boolean;
}

/**
 * Onboard a new supplier straight into this EUP's book. The account is created
 * with a generated one-time password returned once in the response — EUP never
 * chooses it, and it is never stored in plaintext or logged.
 */
export class CreateEupSupplierDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  companyName: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  /** False when this supplier will buy its stock from EUP rather than produce. */
  @IsOptional()
  @IsBoolean()
  hasOwnProduction?: boolean;
}

export class SetSupplierStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status: string;
}

/** Freight rows may target one fulfilment mode or apply to both. */
export const FREIGHT_MODES = ['SHIP_TO_SUPPLIER', 'DROP_SHIP', 'ANY'] as const;

/**
 * A fixed price EUP charges per 1000 pcs. `supplierId` null/omitted sets EUP's
 * default price for the product; a supplierId overrides it for that supplier.
 */
export class UpsertEupPriceDto {
  @IsString()
  @MinLength(1)
  productId: string;

  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @IsNumber()
  @Min(0)
  pricePer1000Eur: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePer1000Usd?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePer1000Gbp?: number | null;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertEupFreightDto {
  @IsOptional()
  @IsString()
  supplierId?: string | null;

  /** ISO-2 destination country, or null/omitted for any destination. */
  @IsOptional()
  @IsString()
  countryCode?: string | null;

  @IsOptional()
  @IsIn(FREIGHT_MODES as unknown as string[])
  fulfilmentMode?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsNumber()
  @Min(0)
  pricePer1000Eur: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePer1000Usd?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePer1000Gbp?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minChargeEur?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minChargeUsd?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minChargeGbp?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  freeOverQty?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  estMinDays?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  estMaxDays?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
