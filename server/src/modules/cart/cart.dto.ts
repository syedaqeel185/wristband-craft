import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class AddCartItemDto {
  @IsOptional()
  @IsString()
  designId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  /** Customization snapshot (printType, hasQrCode, hasTrademark, …). */
  @IsOptional()
  @IsObject()
  options?: Record<string, any>;
}

export class UpdateCartItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CartCheckoutDto {
  @IsOptional()
  @IsObject()
  shippingAddress?: Record<string, any>;

  @IsOptional()
  extraCharges?: any;
}
