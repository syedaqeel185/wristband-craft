import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { PaymentsService } from './payments.service';
import { CreateCheckoutDto } from './payments.dto';

@Controller('payments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Create a Stripe Checkout session and return its hosted URL. */
  @Post('checkout')
  checkout(@Request() req: any, @Body() dto: CreateCheckoutDto) {
    return this.paymentsService.createCheckoutSession(req.user.id, dto.orderIds);
  }

  /** Reconcile a session after the success redirect (?session_id=...). */
  @Get('confirm')
  confirm(@Request() req: any, @Query('session_id') sessionId: string) {
    return this.paymentsService.confirmSession(req.user.id, sessionId);
  }

  /** Supplier/admin confirms an offline (manual/bank/wallet) payment was received. */
  @Post('orders/:orderId/mark-paid')
  @Roles('supplier', 'admin')
  markPaid(@Request() req: any, @Param('orderId') orderId: string) {
    return this.paymentsService.markManualPaid(
      { id: req.user.id, roles: req.user.roles || [] },
      orderId,
    );
  }
}
