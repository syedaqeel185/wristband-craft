import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { encryptJson, decryptJson } from '../../common/crypto.util';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './payment-methods.dto';

/** Mask a secret-ish value, leaving only the last 4 chars visible. */
function mask(value: unknown): string {
  const s = String(value ?? '');
  if (s.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(8, s.length - 4))}${s.slice(-4)}`;
}

@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async requireSupplier(userId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId } });
    if (!supplier) throw new NotFoundException('No supplier profile for this account');
    return supplier;
  }

  /** Public-safe view: metadata + masked config (never raw secrets). */
  private toPublic(m: {
    id: string;
    provider: string;
    label: string | null;
    isDefault: boolean;
    isActive: boolean;
    status: string;
    stripeAccountId: string | null;
    configEncrypted: string | null;
    createdAt: Date;
  }) {
    let maskedConfig: Record<string, string> = {};
    if (m.configEncrypted) {
      try {
        const cfg = decryptJson<Record<string, unknown>>(m.configEncrypted);
        maskedConfig = Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, mask(v)]));
      } catch {
        maskedConfig = {};
      }
    }
    return {
      id: m.id,
      provider: m.provider,
      label: m.label,
      isDefault: m.isDefault,
      isActive: m.isActive,
      status: m.status,
      stripeAccountId: m.stripeAccountId,
      maskedConfig,
      createdAt: m.createdAt,
    };
  }

  /**
   * The supplier's default active payment method for checkout routing.
   * For manual/offline providers the decrypted config is returned as customer
   * payment `instructions` (bank/wallet details are meant to be shown to the
   * paying customer). Returns null when the supplier has no active method.
   */
  async getDefaultForCheckout(supplierId: string): Promise<{
    id: string;
    provider: string;
    label: string | null;
    stripeAccountId: string | null;
    instructions: Record<string, unknown>;
  } | null> {
    const method =
      (await this.prisma.supplierPaymentMethod.findFirst({
        where: { supplierId, isActive: true, isDefault: true },
      })) ??
      (await this.prisma.supplierPaymentMethod.findFirst({
        where: { supplierId, isActive: true },
        orderBy: { createdAt: 'asc' },
      }));
    if (!method) return null;
    let instructions: Record<string, unknown> = {};
    if (method.configEncrypted) {
      try {
        instructions = decryptJson(method.configEncrypted);
      } catch {
        instructions = {};
      }
    }
    return {
      id: method.id,
      provider: method.provider,
      label: method.label,
      stripeAccountId: method.stripeAccountId,
      instructions,
    };
  }

  async list(userId: string) {
    const supplier = await this.requireSupplier(userId);
    const methods = await this.prisma.supplierPaymentMethod.findMany({
      where: { supplierId: supplier.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return methods.map((m) => this.toPublic(m));
  }

  async create(userId: string, dto: CreatePaymentMethodDto) {
    const supplier = await this.requireSupplier(userId);
    const existingCount = await this.prisma.supplierPaymentMethod.count({
      where: { supplierId: supplier.id },
    });
    const makeDefault = dto.isDefault || existingCount === 0;

    const created = await this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.supplierPaymentMethod.updateMany({
          where: { supplierId: supplier.id },
          data: { isDefault: false },
        });
      }
      return tx.supplierPaymentMethod.create({
        data: {
          supplierId: supplier.id,
          provider: dto.provider,
          label: dto.label,
          isDefault: makeDefault,
          // Offline/manual methods (bank, wallet, PayPal, Payoneer, …) are usable
          // as soon as they're added; only Stripe Connect stays PENDING until the
          // supplier finishes hosted onboarding.
          status: dto.provider === 'STRIPE_CONNECT' ? 'PENDING' : 'CONNECTED',
          configEncrypted: dto.config ? encryptJson(dto.config) : null,
        },
      });
    });

    await this.audit.log({
      action: 'payment_method.create',
      entityType: 'supplier_payment_method',
      entityId: created.id,
      actor: { userId, role: 'supplier' },
      metadata: { provider: dto.provider },
    });
    return this.toPublic(created);
  }

  private async requireOwned(userId: string, id: string) {
    const supplier = await this.requireSupplier(userId);
    const method = await this.prisma.supplierPaymentMethod.findUnique({ where: { id } });
    if (!method || method.supplierId !== supplier.id) {
      // Do not reveal whether the id exists for another supplier.
      throw new ForbiddenException('You do not have access to this payment method');
    }
    return { supplier, method };
  }

  async update(userId: string, id: string, dto: UpdatePaymentMethodDto) {
    const { supplier, method } = await this.requireOwned(userId, id);

    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.supplierPaymentMethod.updateMany({
          where: { supplierId: supplier.id },
          data: { isDefault: false },
        });
      }
      await tx.supplierPaymentMethod.update({
        where: { id },
        data: {
          label: dto.label ?? undefined,
          isActive: dto.isActive ?? undefined,
          isDefault: dto.isDefault ?? undefined,
          // Only replace config when a new one is supplied.
          configEncrypted: dto.config ? encryptJson(dto.config) : undefined,
        },
      });
    });

    await this.audit.log({
      action: 'payment_method.update',
      entityType: 'supplier_payment_method',
      entityId: id,
      actor: { userId, role: 'supplier' },
    });
    const fresh = await this.prisma.supplierPaymentMethod.findUnique({ where: { id } });
    return this.toPublic(fresh!);
  }

  async remove(userId: string, id: string) {
    const { supplier, method } = await this.requireOwned(userId, id);
    await this.prisma.supplierPaymentMethod.delete({ where: { id } });

    // If we removed the default, promote the next remaining method.
    if (method.isDefault) {
      const next = await this.prisma.supplierPaymentMethod.findFirst({
        where: { supplierId: supplier.id },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.supplierPaymentMethod.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    await this.audit.log({
      action: 'payment_method.delete',
      entityType: 'supplier_payment_method',
      entityId: id,
      actor: { userId, role: 'supplier' },
    });
    return { success: true };
  }
}
