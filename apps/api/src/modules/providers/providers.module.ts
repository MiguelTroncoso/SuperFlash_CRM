import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ProviderMappingsController, ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [ProvidersController, ProviderMappingsController],
  providers: [ProvidersService],
  exports: [ProvidersService],
})
export class ProvidersModule {}
