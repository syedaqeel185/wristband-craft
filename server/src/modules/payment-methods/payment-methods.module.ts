import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { PaymentMethodsService } from './payment-methods.service';
import { StripeConnectService } from './stripe-connect.service';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './payment-methods.dto';

@Controller('payment-methods')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('supplier')
export class PaymentMethodsController {
  constructor(
    private readonly service: PaymentMethodsService,
    private readonly connect: StripeConnectService,
  ) {}

  @Get()
  list(@Request() req: any) {
    return this.service.list(req.user.id);
  }

  // ---- Stripe Connect onboarding ----

  @Post('stripe/connect')
  startConnect(@Request() req: any) {
    return this.connect.startOnboarding(req.user.id);
  }

  @Get('stripe/status')
  connectStatus(@Request() req: any) {
    return this.connect.status(req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreatePaymentMethodDto) {
    return this.service.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.service.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.id, id);
  }
}

@Module({
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService, StripeConnectService],
  exports: [PaymentMethodsService, StripeConnectService],
})
export class PaymentMethodsModule {}
