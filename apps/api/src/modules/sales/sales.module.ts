import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { CommercialAccessPolicy } from '../commercial/commercial.policy';
import { SalesAccessPolicy } from './access/sales-access.policy';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [AuditModule, AuthModule, CatalogModule, CommissionsModule, ExchangeRatesModule],
  controllers: [SalesController],
  providers: [SalesService, SalesAccessPolicy, CommercialAccessPolicy],
  exports: [SalesService],
})
export class SalesModule {}
