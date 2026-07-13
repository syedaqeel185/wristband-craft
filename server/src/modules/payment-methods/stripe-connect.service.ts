import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';

/**
 * Stripe Connect (Express) onboarding for suppliers. Each supplier connects
 * their own Stripe account; customer card payments are then routed directly to
 * that account via destination charges (see PaymentsService), so the platform
 * never holds supplier funds.
 *
 * Requires the platform Stripe account to have Connect enabled
 * (https://dashboard.stripe.com/connect). When it isn't, onboarding surfaces a
 * clear, actionable error instead of failing opaquely.
 */
@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);
  private readonly stripe: Stripe | null;
  private readonly clientUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    this.stripe = key ? new Stripe(key) : null;
    this.clientUrl = process.env.CLIENT_URL || 'http://localhost:8080';
  }

  enabled(): boolean {
    return !!this.stripe;
  }

  private async requireSupplier(userId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId } });
    if (!supplier) throw new NotFoundException('No supplier profile for this account');
    return supplier;
  }

  /** The supplier's STRIPE_CONNECT payment method row, if any. */
  private async connectMethod(supplierId: string) {
    return this.prisma.supplierPaymentMethod.findFirst({
      where: { supplierId, provider: 'STRIPE_CONNECT' },
    });
  }

  /**
   * Begin (or resume) Stripe Connect onboarding: ensure a connected account
   * exists, then return a fresh onboarding link for the supplier to complete.
   */
  async startOnboarding(userId: string): Promise<{ url: string }> {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured on the server (STRIPE_SECRET_KEY missing).');
    }
    const supplier = await this.requireSupplier(userId);
    let method = await this.connectMethod(supplier.id);

    try {
      let accountId = method?.stripeAccountId ?? null;
      if (!accountId) {
        const account = await this.stripe.accounts.create({
          type: 'express',
          email: supplier.contactEmail,
          metadata: { supplierId: supplier.id },
        });
        accountId = account.id;
        if (method) {
          method = await this.prisma.supplierPaymentMethod.update({
            where: { id: method.id },
            data: { stripeAccountId: accountId },
          });
        } else {
          // If this is the supplier's first method, make it the default.
          const count = await this.prisma.supplierPaymentMethod.count({ where: { supplierId: supplier.id } });
          method = await this.prisma.supplierPaymentMethod.create({
            data: {
              supplierId: supplier.id,
              provider: 'STRIPE_CONNECT',
              label: 'Stripe',
              stripeAccountId: accountId,
              status: 'PENDING',
              isDefault: count === 0,
            },
          });
        }
        await this.audit.log({
          action: 'payment_method.connect_created',
          entityType: 'supplier_payment_method',
          entityId: method.id,
          actor: { userId, role: 'supplier' },
          metadata: { accountId },
        });
      }

      const link = await this.stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${this.clientUrl}/supplier/payments?connect=refresh`,
        return_url: `${this.clientUrl}/supplier/payments?connect=return`,
        type: 'account_onboarding',
      });
      return { url: link.url };
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn(`Stripe Connect onboarding failed: ${msg}`);

      // The platform's own Stripe account hasn't enabled Connect yet. This is a
      // one-time platform-owner action, not a supplier problem — surface a
      // structured code + the exact Stripe page to enable it so the UI can send
      // the owner straight there instead of showing a dead-end error.
      const setupUrl = 'https://dashboard.stripe.com/connect/accounts/overview';
      if (/sign(ed)? up for Connect|Connect.*not.*enabled|only create new accounts/i.test(msg)) {
        throw new BadRequestException({
          code: 'CONNECT_NOT_ENABLED',
          setupUrl,
          message:
            "Stripe Connect isn't enabled on the platform's Stripe account yet. " +
            'Enable it once (free, instant in test mode) at the Stripe dashboard, then try again. ' +
            'If Stripe is unavailable in your country, use a bank/wallet method below instead.',
        });
      }
      throw new BadRequestException({
        code: 'CONNECT_ERROR',
        setupUrl,
        message: `Stripe Connect could not be started: ${msg}`,
      });
    }
  }

  /** Refresh and return the supplier's Connect status; syncs the method row. */
  async status(userId: string) {
    const supplier = await this.requireSupplier(userId);
    const method = await this.connectMethod(supplier.id);
    if (!method?.stripeAccountId || !this.stripe) {
      return { connected: false, chargesEnabled: false, detailsSubmitted: false, accountId: null };
    }
    try {
      const account = await this.stripe.accounts.retrieve(method.stripeAccountId);
      const chargesEnabled = !!account.charges_enabled;
      const newStatus = chargesEnabled ? 'CONNECTED' : 'PENDING';
      if (method.status !== newStatus) {
        await this.prisma.supplierPaymentMethod.update({
          where: { id: method.id },
          data: { status: newStatus },
        });
      }
      return {
        connected: chargesEnabled,
        chargesEnabled,
        detailsSubmitted: !!account.details_submitted,
        payoutsEnabled: !!account.payouts_enabled,
        accountId: method.stripeAccountId,
      };
    } catch (e) {
      this.logger.warn(`Stripe Connect status check failed: ${(e as Error).message}`);
      return { connected: false, chargesEnabled: false, detailsSubmitted: false, accountId: method.stripeAccountId };
    }
  }

  /**
   * Returns the connected account id for a supplier if it can accept charges,
   * else null. Used by the checkout router to decide card routing.
   */
  async chargeableAccountId(supplierId: string): Promise<string | null> {
    const method = await this.connectMethod(supplierId);
    if (!method?.stripeAccountId || !this.stripe || !method.isActive) return null;
    try {
      const account = await this.stripe.accounts.retrieve(method.stripeAccountId);
      return account.charges_enabled ? method.stripeAccountId : null;
    } catch {
      return null;
    }
  }
}
