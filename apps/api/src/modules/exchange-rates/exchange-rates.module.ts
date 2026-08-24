import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates.service';
import { FxSchedulerService } from './fx-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, AuditModule, AuthModule],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService, FxSchedulerService],
  exports: [ExchangeRatesService, FxSchedulerService],
})
export class ExchangeRatesModule {}
