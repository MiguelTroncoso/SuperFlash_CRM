import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
