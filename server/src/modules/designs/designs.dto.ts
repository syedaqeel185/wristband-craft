import { IsOptional, IsString } from 'class-validator';

export class CreateDesignDto {
  @IsString()
  designUrl: string;

  @IsOptional()
  @IsString()
  wristbandColor?: string;

  @IsOptional()
  @IsString()
  wristbandType?: string;

  @IsOptional()
  @IsString()
  customText?: string;

  @IsOptional()
  @IsString()
  textColor?: string;

  @IsOptional()
  textPosition?: any;

  @IsOptional()
  @IsString()
  canvasJson?: string;

  @IsOptional()
  @IsString()
  metaJson?: string;
}
