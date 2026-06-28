import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrdersService } from './orders.service';
import { BulkOrderUpdateDto, CreateOrderDto, UpdateOrderStatusDto, UpdateShipmentDto } from './orders.dto';

@Controller('orders')
@UseGuards(AuthGuard('jwt'))
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Request() req: any, @Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(req.user.id, createOrderDto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.ordersService.findVisibleOrders(req.user);
  }

  @Get('mine')
  findMine(@Request() req: any) {
    return this.ordersService.findByUser(req.user.id);
  }

  @Patch('bulk')
  updateBulk(@Body() dto: BulkOrderUpdateDto) {
    return this.ordersService.updateBulk(dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Request() req: any,
  ) {
    return this.ordersService.updateStatus(id, dto, { id: req.user.id, roles: req.user.roles || [] });
  }

  @Patch(':id/shipment')
  updateShipment(@Param('id') id: string, @Body() dto: UpdateShipmentDto, @Request() req: any) {
    return this.ordersService.updateShipment(id, dto, { id: req.user.id, roles: req.user.roles || [] });
  }

  @Delete(':id')
  deleteDraft(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.deleteDraft(id, req.user.id);
  }

  @Get(':id/timeline')
  getTimeline(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.getTimeline(id, { id: req.user.id, roles: req.user.roles || [] });
  }

  @Get(':id/tracking')
  getTracking(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.getTracking(id, { id: req.user.id, roles: req.user.roles || [] });
  }
}
