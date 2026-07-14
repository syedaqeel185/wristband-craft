import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class CreateCheckoutDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderIds!: string[];
}

export class StripeSessionDto {
  @IsString()
  supplierId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderIds!: string[];
}

export class SubmitReceiptDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderIds!: string[];

  @IsString()
  provider!: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;
}
