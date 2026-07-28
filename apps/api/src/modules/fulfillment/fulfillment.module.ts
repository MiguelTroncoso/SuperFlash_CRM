import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ProvidersModule } from '../providers/providers.module';
import { FulfillmentController, ProvisioningController } from './fulfillment.controller';
import { FulfillmentService } from './fulfillment.service';
import { ManualProviderAdapter } from './adapters/manual-provider.adapter';
import { MockProviderAdapter } from './adapters/mock-provider.adapter';
import {
  ProviderAdapterRegistry,
  PROVIDER_ADAPTER_RESOLVER,
} from './adapters/provider-adapter.registry';

@Module({
  imports: [AuditModule, AuthModule, ProvidersModule],
  controllers: [FulfillmentController, ProvisioningController],
  providers: [
    FulfillmentService,
    ManualProviderAdapter,
    MockProviderAdapter,
    ProviderAdapterRegistry,
    { provide: PROVIDER_ADAPTER_RESOLVER, useExisting: ProviderAdapterRegistry },
  ],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
