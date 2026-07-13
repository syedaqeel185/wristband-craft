import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ShippingService } from './shipping.service';

@Module({
  imports: [PrismaModule],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
