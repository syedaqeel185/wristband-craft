import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';

export const SUB_STATUS = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
} as const;

const USABLE_STATUSES: string[] = [SUB_STATUS.TRIALING, SUB_STATUS.ACTIVE];

/** Prisma tx client or the root client — lets us reuse logic inside $transaction. */
type Db = PrismaService | Prisma.TransactionClient | PrismaClient;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private billingMode(): 'stripe' | 'none' {
    return process.env.BILLING_PROVIDER === 'stripe' ? 'stripe' : 'none';
  }

  private addInterval(from: Date, interval: string): Date {
    const d = new Date(from);
    if (interval === 'year') d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d;
  }

  /** The default plan new/lapsed suppliers are placed on. */
  async getDefaultPlan(db: Db = this.prisma) {
    const plan =
      (await db.subscriptionPlan.findUnique({ where: { code: 'starter' } })) ??
      (await db.subscriptionPlan.findFirst({ where: { isActive: true }, orderBy: { priceUsd: 'asc' } }));
    if (!plan) {
      throw new BadRequestException(
        'No subscription plan configured. Run the seed (prisma/seed.ts) to create the starter plan.',
      );
    }
    return plan;
  }

  /**
   * Create a TRIALING subscription for a supplier. Safe to call inside a
   * transaction (pass the tx client). No-op if one already exists.
   */
  async createTrialForSupplier(supplierId: string, db: Db = this.prisma) {
    const existing = await db.subscription.findUnique({ where: { supplierId } });
    if (existing) return existing;
    const plan = await this.getDefaultPlan(db);
    const now = new Date();
    const trialEnd = new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000);
    return db.subscription.create({
      data: {
        supplierId,
        planId: plan.id,
        status: SUB_STATUS.TRIALING,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        trialEndsAt: trialEnd,
      },
    });
  }

  /**
   * Load the subscription and lazily reconcile it with the clock. Because there
   * is no cron, expiry/renewal is computed on read:
   *  - schema mode (BILLING_PROVIDER=none): auto-renews by rolling the period
   *    forward and recording a PAID SubscriptionPayment.
   *  - stripe mode: does not self-renew (webhooks drive it); a lapsed period
   *    becomes PAST_DUE until reconciled.
   * A canceled subscription (cancelAtPeriodEnd) expires at period end.
   */
  async getUsableState(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    let sub = await this.prisma.subscription.findUnique({
      where: { supplierId },
      include: { plan: true, coupon: true },
    });
    // Self-heal: a supplier should always have a subscription.
    if (!sub) {
      await this.createTrialForSupplier(supplierId);
      sub = await this.prisma.subscription.findUnique({
        where: { supplierId },
        include: { plan: true, coupon: true },
      });
    }
    if (!sub) throw new NotFoundException('Subscription not found');

    // Effective price = plan − coupon + country tax.
    const pricing = await this.computeCharge(sub, supplier.countryCode);

    const now = new Date();
    const periodOver = sub.currentPeriodEnd.getTime() < now.getTime();

    if (periodOver) {
      if (sub.cancelAtPeriodEnd || sub.status === SUB_STATUS.CANCELED) {
        sub = await this.transition(sub.id, SUB_STATUS.EXPIRED, { canceledAt: sub.canceledAt ?? now });
      } else if (this.billingMode() === 'none') {
        sub = await this.autoRenew(sub, pricing);
      } else {
        sub = await this.transition(sub.id, SUB_STATUS.PAST_DUE);
      }
    }

    const supplierSuspended = supplier.status === 'SUSPENDED';
    const statusUsable = USABLE_STATUSES.includes(sub!.status);
    const usable = statusUsable && !supplierSuspended;

    const daysRemaining = Math.max(
      0,
      Math.ceil((sub!.currentPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    );

    let reason: string | null = null;
    if (supplierSuspended) reason = 'SUPPLIER_SUSPENDED';
    else if (!statusUsable) reason = sub!.status === SUB_STATUS.PAST_DUE ? 'PAYMENT_FAILED' : 'SUBSCRIPTION_EXPIRED';

    return {
      usable,
      reason,
      status: sub!.status,
      supplierStatus: supplier.status,
      isTrial: sub!.status === SUB_STATUS.TRIALING,
      trialEndsAt: sub!.trialEndsAt,
      currentPeriodStart: sub!.currentPeriodStart,
      currentPeriodEnd: sub!.currentPeriodEnd,
      nextBillingDate: sub!.cancelAtPeriodEnd ? null : sub!.currentPeriodEnd,
      cancelAtPeriodEnd: sub!.cancelAtPeriodEnd,
      daysRemaining,
      plan: sub!.plan,
      coupon: sub!.coupon ? { code: sub!.coupon.code, description: sub!.coupon.description } : null,
      pricing,
      subscriptionId: sub!.id,
    };
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private async getTaxRatePercent(countryCode?: string | null): Promise<{ percent: number; name: string | null }> {
    if (!countryCode) return { percent: 0, name: null };
    const rate = await this.prisma.taxRate.findFirst({
      where: { countryCode: countryCode.toUpperCase(), isActive: true },
    });
    return { percent: rate?.ratePercent ?? 0, name: rate?.name ?? null };
  }

  /** Effective charge = plan price − coupon discount + country tax. */
  private async computeCharge(
    sub: Prisma.SubscriptionGetPayload<{ include: { plan: true; coupon: true } }>,
    countryCode?: string | null,
  ) {
    const base = sub.plan.priceEur ?? sub.plan.priceUsd;
    let discount = 0;
    if (sub.coupon && sub.coupon.isActive) {
      discount =
        sub.coupon.discountType === 'fixed'
          ? Math.min(sub.coupon.discountValue, base)
          : (base * sub.coupon.discountValue) / 100;
    }
    const taxable = Math.max(0, base - discount);
    const tax = await this.getTaxRatePercent(countryCode);
    const taxAmount = taxable * (tax.percent / 100);
    return {
      base: this.round2(base),
      discount: this.round2(discount),
      taxable: this.round2(taxable),
      taxRatePercent: tax.percent,
      taxName: tax.name,
      tax: this.round2(taxAmount),
      total: this.round2(taxable + taxAmount),
      currency: 'EUR',
      couponCode: sub.coupon?.code ?? null,
    };
  }

  private async transition(id: string, status: string, extra: Prisma.SubscriptionUpdateInput = {}) {
    return this.prisma.subscription.update({
      where: { id },
      data: { status, ...extra },
      include: { plan: true, coupon: true },
    });
  }

  /** Roll one or more periods forward (schema mode), recording each as PAID. */
  private async autoRenew(
    sub: Prisma.SubscriptionGetPayload<{ include: { plan: true; coupon: true } }>,
    pricing: { total: number; discount: number; tax: number; currency: string },
  ) {
    const now = new Date();
    let periodStart = sub.currentPeriodStart;
    let periodEnd = sub.currentPeriodEnd;
    let guard = 0;
    while (periodEnd.getTime() < now.getTime() && guard < 60) {
      periodStart = periodEnd;
      periodEnd = this.addInterval(periodEnd, sub.plan.interval);
      guard += 1;
      await this.prisma.subscriptionPayment.create({
        data: {
          subscriptionId: sub.id,
          supplierId: sub.supplierId,
          amount: pricing.total,
          discountAmount: pricing.discount,
          taxAmount: pricing.tax,
          currency: pricing.currency,
          status: 'PAID',
          periodStart,
          periodEnd,
          paidAt: periodStart,
        },
      });
    }
    return this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SUB_STATUS.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
      include: { plan: true, coupon: true },
    });
  }

  /**
   * Gate for supplier write actions (create product, accept new orders).
   * Throws a 403 with a stable `code` the frontend surfaces as a banner.
   */
  async assertActive(supplierId: string) {
    const state = await this.getUsableState(supplierId);
    if (!state.usable) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_INACTIVE',
        reason: state.reason,
        message:
          state.reason === 'SUPPLIER_SUSPENDED'
            ? 'This supplier account is suspended. Please contact the platform administrator.'
            : 'An active subscription is required to perform this action. Please renew your subscription.',
      });
    }
    return state;
  }

  // ---- Supplier-facing (by user id) ----

  private async requireSupplier(userId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId } });
    if (!supplier) throw new NotFoundException('No supplier profile for this account');
    return supplier;
  }

  async getMine(userId: string) {
    const supplier = await this.requireSupplier(userId);
    return this.getUsableState(supplier.id);
  }

  async getMyPayments(userId: string) {
    const supplier = await this.requireSupplier(userId);
    return this.prisma.subscriptionPayment.findMany({
      where: { supplierId: supplier.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(userId: string) {
    const supplier = await this.requireSupplier(userId);
    const sub = await this.prisma.subscription.findUnique({ where: { supplierId: supplier.id } });
    if (!sub) throw new NotFoundException('Subscription not found');
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
      include: { plan: true },
    });
    await this.audit.log({
      action: 'subscription.cancel',
      entityType: 'subscription',
      entityId: sub.id,
      actor: { userId, role: 'supplier' },
    });
    return updated;
  }

  async resume(userId: string) {
    const supplier = await this.requireSupplier(userId);
    const sub = await this.prisma.subscription.findUnique({ where: { supplierId: supplier.id } });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.status === SUB_STATUS.EXPIRED) {
      throw new BadRequestException('Subscription has already expired — start a new period instead.');
    }
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: false, canceledAt: null },
      include: { plan: true },
    });
    await this.audit.log({
      action: 'subscription.resume',
      entityType: 'subscription',
      entityId: sub.id,
      actor: { userId, role: 'supplier' },
    });
    return updated;
  }

  async changePlan(userId: string, planCode: string) {
    const supplier = await this.requireSupplier(userId);
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Unknown or inactive plan');
    }
    const sub = await this.prisma.subscription.findUnique({ where: { supplierId: supplier.id } });
    if (!sub) throw new NotFoundException('Subscription not found');
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { planId: plan.id },
      include: { plan: true },
    });
    await this.audit.log({
      action: 'subscription.change_plan',
      entityType: 'subscription',
      entityId: sub.id,
      actor: { userId, role: 'supplier' },
      metadata: { planCode },
    });
    return updated;
  }

  /** Redeem a coupon code onto the current subscription (validated). */
  async applyCoupon(userId: string, code: string) {
    const supplier = await this.requireSupplier(userId);
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!coupon || !coupon.isActive) throw new BadRequestException('Invalid or inactive coupon code');
    if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This coupon has expired');
    }
    if (coupon.maxRedemptions != null && coupon.timesRedeemed >= coupon.maxRedemptions) {
      throw new BadRequestException('This coupon has reached its redemption limit');
    }
    const sub = await this.prisma.subscription.findUnique({ where: { supplierId: supplier.id } });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.couponId === coupon.id) {
      return this.getUsableState(supplier.id);
    }

    await this.prisma.$transaction([
      this.prisma.subscription.update({ where: { id: sub.id }, data: { couponId: coupon.id } }),
      this.prisma.coupon.update({ where: { id: coupon.id }, data: { timesRedeemed: { increment: 1 } } }),
    ]);
    await this.audit.log({
      action: 'subscription.apply_coupon',
      entityType: 'subscription',
      entityId: sub.id,
      actor: { userId, role: 'supplier' },
      metadata: { code: coupon.code },
    });
    return this.getUsableState(supplier.id);
  }

  async removeCoupon(userId: string) {
    const supplier = await this.requireSupplier(userId);
    const sub = await this.prisma.subscription.findUnique({ where: { supplierId: supplier.id } });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.couponId) {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { couponId: null } });
    }
    return this.getUsableState(supplier.id);
  }
}
