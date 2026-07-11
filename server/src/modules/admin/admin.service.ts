import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { SUB_STATUS } from '../subscriptions/subscriptions.service';
import {
  CreateCouponDto,
  CreatePlanDto,
  UpdateCouponDto,
  UpdatePlanDto,
  UpdateSubscriptionDto,
  UpsertTaxRateDto,
} from './admin.dto';

const USABLE = [SUB_STATUS.TRIALING, SUB_STATUS.ACTIVE];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async overview() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalSuppliers,
      suspendedSuppliers,
      trialSuppliers,
      activeSuppliers,
      expiredSuppliers,
      newSuppliersThisMonth,
      cancelledSubscriptions,
      totalOrders,
      paidPayments,
    ] = await Promise.all([
      this.prisma.supplier.count(),
      this.prisma.supplier.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.subscription.count({
        where: { status: SUB_STATUS.TRIALING, currentPeriodEnd: { gte: now } },
      }),
      this.prisma.subscription.count({
        where: { status: { in: USABLE }, currentPeriodEnd: { gte: now } },
      }),
      this.prisma.subscription.count({
        where: {
          OR: [
            { status: { in: [SUB_STATUS.EXPIRED, SUB_STATUS.PAST_DUE, SUB_STATUS.CANCELED] } },
            { currentPeriodEnd: { lt: now } },
          ],
        },
      }),
      this.prisma.supplier.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.subscription.count({
        where: { OR: [{ cancelAtPeriodEnd: true }, { status: SUB_STATUS.CANCELED }] },
      }),
      this.prisma.order.count(),
      this.prisma.subscriptionPayment.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    // Customers = users who are not suppliers.
    const [userRoleCount, supplierUserCount] = await Promise.all([
      this.prisma.userRole.count({ where: { role: 'user' } }),
      this.prisma.userRole.count({ where: { role: 'supplier' } }),
    ]);

    // MRR: active (non-trial) subscriptions × normalized monthly plan price.
    const activePaying = await this.prisma.subscription.findMany({
      where: { status: SUB_STATUS.ACTIVE, currentPeriodEnd: { gte: now } },
      include: { plan: true },
    });
    const mrr = activePaying.reduce((sum, s) => {
      const price = s.plan.priceEur ?? s.plan.priceUsd;
      return sum + (s.plan.interval === 'year' ? price / 12 : price);
    }, 0);

    // Orders grouped by status (for a chart).
    const ordersByStatusRaw = await this.prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const ordersByStatus = ordersByStatusRaw.map((r) => ({
      status: r.status,
      count: r._count._all,
    }));

    return {
      suppliers: {
        total: totalSuppliers,
        active: activeSuppliers,
        trial: trialSuppliers,
        expired: expiredSuppliers,
        suspended: suspendedSuppliers,
        newThisMonth: newSuppliersThisMonth,
      },
      subscriptions: {
        active: activeSuppliers,
        cancelled: cancelledSubscriptions,
      },
      revenue: {
        mrr: Math.round(mrr * 100) / 100,
        totalSubscriptionRevenue: paidPayments._sum.amount ?? 0,
        currency: 'EUR',
      },
      customers: { total: userRoleCount },
      orders: { total: totalOrders, byStatus: ordersByStatus },
      suppliersWithRole: supplierUserCount,
    };
  }

  async listSuppliers(query: { search?: string; country?: string; status?: string }) {
    const where: Prisma.SupplierWhereInput = {};
    if (query.country) where.countryCode = query.country.toUpperCase();
    if (query.status) where.status = query.status.toUpperCase();
    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { contactEmail: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const suppliers = await this.prisma.supplier.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { products: true, orders: true } },
      },
    });

    return suppliers.map((s) => ({
      id: s.id,
      companyName: s.companyName,
      contactEmail: s.contactEmail,
      country: s.countryCode ?? s.country,
      countryCode: s.countryCode,
      city: s.city,
      status: s.status,
      isVerified: s.isVerified,
      rating: s.rating,
      createdAt: s.createdAt,
      productCount: s._count.products,
      orderCount: s._count.orders,
      subscription: s.subscription
        ? {
            status: s.subscription.status,
            plan: s.subscription.plan.name,
            trialEndsAt: s.subscription.trialEndsAt,
            currentPeriodEnd: s.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: s.subscription.cancelAtPeriodEnd,
          }
        : null,
    }));
  }

  async getSupplier(id: string) {
    const s = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true, payments: { orderBy: { createdAt: 'desc' } } } },
        _count: { select: { products: true, orders: true } },
      },
    });
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  async setSupplierStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', actor: { userId: string }) {
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Supplier not found');
    const updated = await this.prisma.supplier.update({ where: { id }, data: { status } });
    await this.audit.log({
      action: status === 'SUSPENDED' ? 'supplier.suspend' : 'supplier.activate',
      entityType: 'supplier',
      entityId: id,
      actor: { userId: actor.userId, role: 'admin' },
    });
    return updated;
  }

  async setSupplierCountry(id: string, countryCode: string, actor: { userId: string }) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const code = countryCode.trim().toUpperCase();
    const country = await this.prisma.country.findUnique({ where: { code } });
    if (!country) throw new BadRequestException('Unknown country code');
    const updated = await this.prisma.supplier.update({
      where: { id },
      // Keep the legacy `country` string mirrored with the normalized code.
      data: { countryCode: code, country: code },
    });
    await this.audit.log({
      action: 'supplier.set_country',
      entityType: 'supplier',
      entityId: id,
      actor: { userId: actor.userId, role: 'admin' },
      metadata: { countryCode: code },
    });
    return updated;
  }

  async deleteSupplier(id: string, actor: { userId: string }) {
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Supplier not found');
    // Detach orders (keep the historical record) then remove the supplier and
    // its cascade-owned rows (products, subscription, payment methods, reviews).
    await this.prisma.$transaction([
      this.prisma.order.updateMany({ where: { supplierId: id }, data: { supplierId: null } }),
      this.prisma.supplier.delete({ where: { id } }),
    ]);
    await this.audit.log({
      action: 'supplier.delete',
      entityType: 'supplier',
      entityId: id,
      actor: { userId: actor.userId, role: 'admin' },
      metadata: { companyName: s.companyName },
    });
    return { success: true };
  }

  async listSubscriptions(status?: string) {
    return this.prisma.subscription.findMany({
      where: status ? { status: status.toUpperCase() } : undefined,
      orderBy: { updatedAt: 'desc' },
      include: {
        plan: true,
        supplier: { select: { id: true, companyName: true, contactEmail: true, status: true } },
      },
    });
  }

  async updateSubscription(id: string, dto: UpdateSubscriptionDto, actor: { userId: string }) {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('Subscription not found');
    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { status: dto.status ?? undefined },
      include: { plan: true },
    });
    await this.audit.log({
      action: 'subscription.admin_update',
      entityType: 'subscription',
      entityId: id,
      actor: { userId: actor.userId, role: 'admin' },
      metadata: { status: dto.status },
    });
    return updated;
  }

  // ---- Plans ----

  listPlans() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: { priceUsd: 'asc' } });
  }

  async createPlan(dto: CreatePlanDto, actor: { userId: string }) {
    const existing = await this.prisma.subscriptionPlan.findUnique({ where: { code: dto.code } });
    if (existing) throw new BadRequestException('A plan with this code already exists');
    const plan = await this.prisma.subscriptionPlan.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        priceUsd: dto.priceUsd,
        priceEur: dto.priceEur,
        priceGbp: dto.priceGbp,
        interval: dto.interval ?? 'month',
        trialDays: dto.trialDays ?? 30,
        featuresJson: dto.features ? JSON.stringify(dto.features) : undefined,
      },
    });
    await this.audit.log({
      action: 'plan.create',
      entityType: 'subscription_plan',
      entityId: plan.id,
      actor: { userId: actor.userId, role: 'admin' },
    });
    return plan;
  }

  async updatePlan(id: string, dto: UpdatePlanDto, actor: { userId: string }) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        priceUsd: dto.priceUsd ?? undefined,
        priceEur: dto.priceEur ?? undefined,
        priceGbp: dto.priceGbp ?? undefined,
        interval: dto.interval ?? undefined,
        trialDays: dto.trialDays ?? undefined,
        isActive: dto.isActive ?? undefined,
        featuresJson: dto.features ? JSON.stringify(dto.features) : undefined,
      },
    });
    await this.audit.log({
      action: 'plan.update',
      entityType: 'subscription_plan',
      entityId: id,
      actor: { userId: actor.userId, role: 'admin' },
    });
    return updated;
  }

  // ---- Revenue analytics ----

  async revenue() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Run-rate MRR from active paying subscriptions.
    const activePaying = await this.prisma.subscription.findMany({
      where: { status: SUB_STATUS.ACTIVE, currentPeriodEnd: { gte: now } },
      include: { plan: true },
    });
    const mrr = activePaying.reduce((s, sub) => {
      const price = sub.plan.priceEur ?? sub.plan.priceUsd;
      return s + (sub.plan.interval === 'year' ? price / 12 : price);
    }, 0);

    const [monthAgg, yearAgg, totalAgg, failed, upcoming, cancelled, last6mPayments] = await Promise.all([
      this.prisma.subscriptionPayment.aggregate({
        where: { status: 'PAID', paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.subscriptionPayment.aggregate({
        where: { status: 'PAID', paidAt: { gte: startOfYear } },
        _sum: { amount: true },
      }),
      this.prisma.subscriptionPayment.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true, taxAmount: true, discountAmount: true },
      }),
      this.prisma.subscriptionPayment.findMany({
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { subscription: { include: { supplier: { select: { companyName: true } } } } },
      }),
      this.prisma.subscription.findMany({
        where: {
          status: { in: [SUB_STATUS.ACTIVE, SUB_STATUS.TRIALING] },
          cancelAtPeriodEnd: false,
          currentPeriodEnd: { gte: now, lte: in30Days },
        },
        orderBy: { currentPeriodEnd: 'asc' },
        include: { plan: true, supplier: { select: { companyName: true } } },
      }),
      this.prisma.subscription.findMany({
        where: { OR: [{ cancelAtPeriodEnd: true }, { status: SUB_STATUS.CANCELED }] },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: { plan: true, supplier: { select: { companyName: true } } },
      }),
      this.prisma.subscriptionPayment.findMany({
        where: { status: 'PAID', paidAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
        select: { amount: true, paidAt: true },
      }),
    ]);

    // Bucket last 6 months for a trend chart.
    const trend: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString(undefined, { month: 'short' });
      const revenue = last6mPayments
        .filter((p) => p.paidAt && `${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, '0')}` === key)
        .reduce((s, p) => s + p.amount, 0);
      trend.push({ month: label, revenue: Math.round(revenue * 100) / 100 });
    }

    return {
      currency: 'EUR',
      mrr: Math.round(mrr * 100) / 100,
      monthlyRevenue: monthAgg._sum.amount ?? 0,
      annualRevenue: yearAgg._sum.amount ?? 0,
      totalSubscriptionRevenue: totalAgg._sum.amount ?? 0,
      totalTaxCollected: totalAgg._sum.taxAmount ?? 0,
      totalDiscountsGiven: totalAgg._sum.discountAmount ?? 0,
      trend,
      failedPayments: failed.map((p) => ({
        id: p.id,
        supplier: p.subscription?.supplier?.companyName ?? '—',
        amount: p.amount,
        currency: p.currency,
        reason: p.failureReason,
        createdAt: p.createdAt,
      })),
      upcomingRenewals: upcoming.map((s) => ({
        id: s.id,
        supplier: s.supplier?.companyName ?? '—',
        plan: s.plan.name,
        renewsAt: s.currentPeriodEnd,
      })),
      cancelledSubscriptions: cancelled.map((s) => ({
        id: s.id,
        supplier: s.supplier?.companyName ?? '—',
        plan: s.plan.name,
        endsAt: s.currentPeriodEnd,
        status: s.status,
      })),
    };
  }

  // ---- Coupons ----

  listCoupons() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createCoupon(dto: CreateCouponDto, actor: { userId: string }) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) throw new BadRequestException('A coupon with this code already exists');
    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        description: dto.description,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        maxRedemptions: dto.maxRedemptions,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
    await this.audit.log({
      action: 'coupon.create',
      entityType: 'coupon',
      entityId: coupon.id,
      actor: { userId: actor.userId, role: 'admin' },
      metadata: { code },
    });
    return coupon;
  }

  async updateCoupon(id: string, dto: UpdateCouponDto, actor: { userId: string }) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    const updated = await this.prisma.coupon.update({
      where: { id },
      data: {
        isActive: dto.isActive ?? undefined,
        description: dto.description ?? undefined,
        discountValue: dto.discountValue ?? undefined,
        maxRedemptions: dto.maxRedemptions ?? undefined,
      },
    });
    await this.audit.log({
      action: 'coupon.update',
      entityType: 'coupon',
      entityId: id,
      actor: { userId: actor.userId, role: 'admin' },
    });
    return updated;
  }

  // ---- Tax rates ----

  listTaxRates() {
    return this.prisma.taxRate.findMany({ orderBy: { countryCode: 'asc' } });
  }

  async upsertTaxRate(dto: UpsertTaxRateDto, actor: { userId: string }) {
    const countryCode = dto.countryCode.trim().toUpperCase();
    const rate = await this.prisma.taxRate.upsert({
      where: { countryCode },
      update: { name: dto.name, ratePercent: dto.ratePercent, isActive: dto.isActive ?? true },
      create: { countryCode, name: dto.name, ratePercent: dto.ratePercent, isActive: dto.isActive ?? true },
    });
    await this.audit.log({
      action: 'tax_rate.upsert',
      entityType: 'tax_rate',
      entityId: rate.id,
      actor: { userId: actor.userId, role: 'admin' },
      metadata: { countryCode, ratePercent: dto.ratePercent },
    });
    return rate;
  }
}
