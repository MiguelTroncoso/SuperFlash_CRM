import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';

import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, ExchangeRatesModule],
  controllers: [FinancialController],
  providers: [FinancialService],
  exports: [FinancialService],
})
export class FinancialModule {}
