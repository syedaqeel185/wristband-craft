import { Body, Controller, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { OrdersService } from './orders.service';

class ConfirmProductionDto {
  @IsString()
  token!: string;
}

/**
 * Public (token-authenticated) order endpoints — reached from email links, so
 * they must NOT sit behind the JWT guard on the main OrdersController.
 */
@Controller('orders')
export class OrdersPublicController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('confirm-production')
  confirmProduction(@Body() dto: ConfirmProductionDto) {
    return this.ordersService.confirmProduction(dto.token);
  }
}
