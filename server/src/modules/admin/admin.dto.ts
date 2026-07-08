import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  priceUsd: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceEur?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceGbp?: number;

  @IsOptional()
  @IsIn(['month', 'year'])
  interval?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @IsOptional()
  @IsArray()
  features?: string[];
}

export class UpdatePlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) priceUsd?: number;
  @IsOptional() @IsNumber() @Min(0) priceEur?: number;
  @IsOptional() @IsNumber() @Min(0) priceGbp?: number;
  @IsOptional() @IsIn(['month', 'year']) interval?: string;
  @IsOptional() @IsInt() @Min(0) trialDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() features?: string[];
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsIn(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'])
  status?: string;
}

export class CreateCouponDto {
  @IsString()
  @MinLength(2)
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['percent', 'fixed'])
  discountType: string;

  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class UpdateCouponDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) discountValue?: number;
  @IsOptional() @IsInt() @Min(1) maxRedemptions?: number;
}

export class UpsertTaxRateDto {
  @IsString()
  @MinLength(2)
  countryCode: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  @Min(0)
  ratePercent: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
