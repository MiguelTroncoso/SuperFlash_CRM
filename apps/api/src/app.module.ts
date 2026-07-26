import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

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
import { SalesModule } from './modules/sales/sales.module';
import { UsersModule } from './modules/users/users.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    CampaignsModule,
    DashboardModule,
    AuditModule,
    WhatsAppModule,
  ],
})
export class AppModule {}
