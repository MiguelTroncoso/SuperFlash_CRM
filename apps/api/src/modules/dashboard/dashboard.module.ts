import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { OperationalDashboardController } from './operational-dashboard.controller';
import { OperationalDashboardService } from './operational-dashboard.service';

import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, ExchangeRatesModule],
  controllers: [OperationalDashboardController],
  providers: [OperationalDashboardService],
  exports: [OperationalDashboardService],
})
export class DashboardModule {}
