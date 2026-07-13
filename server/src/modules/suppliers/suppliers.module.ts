import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ShippingModule } from '../shipping/shipping.module';

@Module({
  imports: [
    PrismaModule,
    SubscriptionsModule,
    ShippingModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [SuppliersService],
  controllers: [SuppliersController],
})
export class SuppliersModule {}
