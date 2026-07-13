import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export const PAYMENT_PROVIDERS = [
  'STRIPE_CONNECT',
  'PAYPAL',
  'PAYONEER',
  'BANK_TRANSFER',
  'JAZZCASH',
  'EASYPAISA',
  'MANUAL',
] as const;

export class CreatePaymentMethodDto {
  @IsIn(PAYMENT_PROVIDERS as unknown as string[])
  provider: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  /** Provider-specific secrets/details; encrypted at rest. */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
