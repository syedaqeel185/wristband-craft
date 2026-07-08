import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { StripeBillingService } from './stripe-billing.service';
import { WebhookController } from './webhook.controller';

@Module({
  controllers: [SubscriptionsController, WebhookController],
  providers: [SubscriptionsService, StripeBillingService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
