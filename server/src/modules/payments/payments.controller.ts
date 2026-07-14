import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { PaymentsService } from './payments.service';
import { CreateCheckoutDto, StripeSessionDto, SubmitReceiptDto } from './payments.dto';

@Controller('payments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Create a Stripe Checkout session and return its hosted URL. */
  @Post('checkout')
  checkout(@Request() req: any, @Body() dto: CreateCheckoutDto) {
    return this.paymentsService.createCheckoutSession(req.user.id, dto.orderIds);
  }

  /** Payment options per supplier (all methods) so the customer can choose. */
  @Get('options')
  options(@Request() req: any, @Query('orderIds') orderIds: string) {
    const ids = (orderIds || '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.paymentsService.getCheckoutOptions(req.user.id, ids);
  }

  /** Create a Stripe session for the customer's chosen supplier group. */
  @Post('stripe-session')
  stripeSession(@Request() req: any, @Body() dto: StripeSessionDto) {
    return this.paymentsService.createStripeSessionForGroup(req.user.id, dto.supplierId, dto.orderIds);
  }

  /** Customer submits a manual/offline payment (with optional receipt) for review. */
  @Post('submit-receipt')
  submitReceipt(@Request() req: any, @Body() dto: SubmitReceiptDto) {
    return this.paymentsService.submitReceipt(req.user.id, dto);
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
