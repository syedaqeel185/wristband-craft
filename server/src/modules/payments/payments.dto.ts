import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class CreateCheckoutDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderIds!: string[];
}
