import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { WholesaleController } from './wholesale.controller';
import { WholesaleService } from './wholesale.service';
import { EupPricingService } from './eup-pricing.service';

@Module({
  imports: [PrismaModule, PaymentMethodsModule],
  controllers: [WholesaleController],
  providers: [WholesaleService, EupPricingService],
  exports: [WholesaleService, EupPricingService],
})
export class WholesaleModule {}
