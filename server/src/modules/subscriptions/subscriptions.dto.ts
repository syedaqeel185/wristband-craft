import { IsString, MinLength } from 'class-validator';

export class ChangePlanDto {
  @IsString()
  @MinLength(1)
  planCode: string;
}

export class ApplyCouponDto {
  @IsString()
  @MinLength(1)
  code: string;
}
