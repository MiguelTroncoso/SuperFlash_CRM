import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { appConfiguration, validateEnvironment } from './config/configuration';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { EventsModule } from './infrastructure/events/events.module';
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
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { RenewalsModule } from './modules/renewals/renewals.module';
import { RequestCorrelationInterceptor } from './infrastructure/http/request-correlation.interceptor';
import { OutboxModule } from './infrastructure/outbox/outbox.module';
import { ActivationsModule } from './modules/activations/activations.module';
import { CredentialsModule } from './modules/credentials/credentials.module';
import { FulfillmentModule } from './modules/fulfillment/fulfillment.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { TrialsModule } from './modules/trials/trials.module';
import { AutomationModule } from './modules/automation/automation.module';
import { RevenueIntelligenceModule } from './modules/revenue-intelligence/revenue-intelligence.module';
import { SmartInboxModule } from './modules/smart-inbox/smart-inbox.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { FinancialModule } from './modules/financial/financial.module';
import { RenewalIntelligenceModule } from './modules/renewal-intelligence/renewal-intelligence.module';
import { ExecutiveIntelligenceModule } from './modules/executive-intelligence/executive-intelligence.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { CustomersModule } from './modules/customers/customers.module';

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
    EventsModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ContactsModule,
    OpportunitiesModule,
    ActivitiesModule,
    FollowUpsModule,
    SalesModule,
    PaymentsModule,
    SubscriptionsModule,
    RenewalsModule,
    OutboxModule,
    ProductsModule,
    CatalogModule,
    CampaignsModule,
    DashboardModule,
    AuditModule,
    WhatsAppModule,
    ProvidersModule,
    FulfillmentModule,
    CredentialsModule,
    TrialsModule,
    ActivationsModule,
    AutomationModule,
    RevenueIntelligenceModule,
    SmartInboxModule,
    CommunicationModule,
    FinancialModule,
    RenewalIntelligenceModule,
    ExecutiveIntelligenceModule,
    MarketingModule,
    CustomersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestCorrelationInterceptor },
  ],
})
export class AppModule {}
