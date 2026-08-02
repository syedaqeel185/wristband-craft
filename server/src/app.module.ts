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
import { AuditModule } from './common/audit.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AdminModule } from './modules/admin/admin.module';
import { CountriesModule } from './modules/countries/countries.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { WholesaleModule } from './modules/wholesale/wholesale.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
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
    SubscriptionsModule,
    AdminModule,
    CountriesModule,
    PaymentMethodsModule,
    WholesaleModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
