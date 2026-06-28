import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentsService } from './payments.service';
import { CreateCheckoutDto } from './payments.dto';

@Controller('payments')
@UseGuards(AuthGuard('jwt'))
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
}
