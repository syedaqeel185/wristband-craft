import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrdersController } from './orders.controller';
import { OrdersPublicController } from './orders.public.controller';
import { OrdersService } from './orders.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [
    PricingModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '14d' },
    }),
  ],
  controllers: [OrdersController, OrdersPublicController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
