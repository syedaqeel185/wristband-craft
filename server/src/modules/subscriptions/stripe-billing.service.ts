import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { SUB_STATUS } from './subscriptions.service';

/**
 * Live subscription billing via Stripe Billing. Entirely inert unless
 * BILLING_PROVIDER=stripe. When enabled, the webhook reconciles our
 * Subscription/SubscriptionPayment rows with Stripe's source of truth.
 *
 * Supplier enrollment (create Stripe customer + subscription with a trial and
 * redirect to collect a card) is wired in Phase 2 alongside Stripe Connect.
 */
@Injectable()
export class StripeBillingService {
  private readonly logger = new Logger(StripeBillingService.name);
  private readonly stripe: Stripe | null;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY;
    this.stripe = this.enabled() && key ? new Stripe(key) : null;
  }

  enabled(): boolean {
    return process.env.BILLING_PROVIDER === 'stripe';
  }

  /** Verify a webhook signature and return the parsed event. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.stripe) throw new BadRequestException('Stripe billing is not enabled');
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not set');
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'invoice.paid':
        await this.onInvoice(event.data.object as Stripe.Invoice, 'PAID');
        break;
      case 'invoice.payment_failed':
        await this.onInvoice(event.data.object as Stripe.Invoice, 'FAILED');
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  private async findLocal(stripeSubscriptionId?: string | null) {
    if (!stripeSubscriptionId) return null;
    return this.prisma.subscription.findFirst({ where: { stripeSubscriptionId } });
  }

  private async onInvoice(invoice: Stripe.Invoice, status: 'PAID' | 'FAILED') {
    const subId = typeof (invoice as any).subscription === 'string'
      ? (invoice as any).subscription
      : (invoice as any).subscription?.id;
    const local = await this.findLocal(subId);
    if (!local) return;

    await this.prisma.subscriptionPayment.create({
      data: {
        subscriptionId: local.id,
        supplierId: local.supplierId,
        amount: (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100,
        currency: (invoice.currency ?? 'eur').toUpperCase(),
        status,
        stripeInvoiceId: invoice.id,
        paidAt: status === 'PAID' ? new Date() : null,
        failureReason: status === 'FAILED' ? 'Stripe reported payment_failed' : null,
      },
    });

    await this.prisma.subscription.update({
      where: { id: local.id },
      data: { status: status === 'PAID' ? SUB_STATUS.ACTIVE : SUB_STATUS.PAST_DUE },
    });
  }

  private async onSubscriptionChange(sub: Stripe.Subscription) {
    const local = await this.findLocal(sub.id);
    if (!local) return;
    const map: Record<string, string> = {
      trialing: SUB_STATUS.TRIALING,
      active: SUB_STATUS.ACTIVE,
      past_due: SUB_STATUS.PAST_DUE,
      canceled: SUB_STATUS.CANCELED,
      unpaid: SUB_STATUS.PAST_DUE,
    };
    const periodEnd = (sub as any).current_period_end;
    await this.prisma.subscription.update({
      where: { id: local.id },
      data: {
        status: map[sub.status] ?? local.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? local.cancelAtPeriodEnd,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : local.currentPeriodEnd,
      },
    });
  }
}
