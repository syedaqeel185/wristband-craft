import { Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { StripeBillingService } from './stripe-billing.service';

/**
 * Stripe billing webhook. Unauthenticated (verified by signature). No-op unless
 * BILLING_PROVIDER=stripe. Requires the raw request body — enabled via
 * `rawBody: true` in main.ts so the signature check sees exact bytes.
 */
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly billing: StripeBillingService) {}

  @Post('stripe')
  @HttpCode(200)
  async stripe(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    if (!this.billing.enabled()) {
      return { received: true, ignored: 'billing disabled' };
    }
    try {
      const event = this.billing.constructEvent(req.rawBody as Buffer, signature);
      await this.billing.handleEvent(event);
      return { received: true };
    } catch (e) {
      this.logger.warn(`Stripe webhook rejected: ${(e as Error).message}`);
      return { received: false, error: (e as Error).message };
    }
  }
}
