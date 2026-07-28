import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { appConfiguration, validateEnvironment } from './config/configuration';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FollowUpsModule } from './modules/follow-ups/follow-ups.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProductsModule } from './modules/products/products.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { SalesModule } from './modules/sales/sales.module';
import { UsersModule } from './modules/users/users.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfiguration],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
      getTracker: (request: Record<string, unknown>) => {
        const headers = request.headers;
        if (typeof headers === 'object' && headers !== null) {
          const forwardedFor = (headers as Record<string, unknown>)['x-forwarded-for'];
          if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
            return forwardedFor.split(',')[0]?.trim() || 'unknown-ip';
          }
        }
        return typeof request.ip === 'string' ? request.ip : 'unknown-ip';
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ContactsModule,
    OpportunitiesModule,
    ActivitiesModule,
    FollowUpsModule,
    SalesModule,
    PaymentsModule,
    ProductsModule,
    CatalogModule,
    CampaignsModule,
    DashboardModule,
    AuditModule,
    WhatsAppModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
