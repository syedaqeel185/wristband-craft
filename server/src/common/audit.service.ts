import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditActor {
  userId?: string | null;
  role?: string | null;
  ip?: string | null;
}

/**
 * Lightweight append-only audit trail for security-sensitive mutations
 * (subscription changes, supplier suspend/activate, payment-method edits).
 * Best-effort: never throws into the caller's request path.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    action: string;
    entityType: string;
    entityId?: string | null;
    actor?: AuditActor;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId ?? undefined,
          actorUserId: params.actor?.userId ?? undefined,
          actorRole: params.actor?.role ?? undefined,
          ip: params.actor?.ip ?? undefined,
          metadataJson: params.metadata ? JSON.stringify(params.metadata) : undefined,
        },
      });
    } catch (e) {
      this.logger.warn(`Audit log failed for ${params.action}: ${(e as Error).message}`);
    }
  }
}
