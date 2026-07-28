import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommercialAccessPolicy } from '../commercial/commercial.policy';
import { SalesAccessPolicy } from './access/sales-access.policy';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [SalesController],
  providers: [SalesService, SalesAccessPolicy, CommercialAccessPolicy],
  exports: [SalesService],
})
export class SalesModule {}
