import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CartService } from './cart.service';
import { AddCartItemDto, CartCheckoutDto, UpdateCartItemDto } from './cart.dto';

@Controller('cart')
@UseGuards(AuthGuard('jwt'))
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  get(@Request() req: any) {
    return this.cartService.getCart(req.user.id);
  }

  @Post('items')
  add(@Request() req: any, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(req.user.id, dto);
  }

  @Patch('items/:id')
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateItem(req.user.id, id, dto);
  }

  @Delete('items/:id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.cartService.removeItem(req.user.id, id);
  }

  @Delete()
  clear(@Request() req: any) {
    return this.cartService.clear(req.user.id);
  }

  @Post('checkout')
  checkout(@Request() req: any, @Body() dto: CartCheckoutDto) {
    return this.cartService.checkout(req.user.id, dto);
  }
}
