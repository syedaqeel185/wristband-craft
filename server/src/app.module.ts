import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { AuthModule } from './modules/auth/auth.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { DesignsModule } from './modules/designs/designs.module';
import { ProductsModule } from './modules/products/products.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { EmailModule } from './modules/email/email.module';
import { CartModule } from './modules/cart/cart.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SuppliersModule,
    OrdersModule,
    ProfilesModule,
    DesignsModule,
    ProductsModule,
    PricingModule,
    PaymentsModule,
    EmailModule,
    CartModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
