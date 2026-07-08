import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Global so any module can inject AuditService without re-importing.
 * PrismaModule is already @Global, so no imports are needed here.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
