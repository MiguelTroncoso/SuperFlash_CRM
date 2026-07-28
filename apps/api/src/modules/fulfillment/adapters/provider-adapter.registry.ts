import { Injectable } from '@nestjs/common';
import { Provider, ProviderType } from '@prisma/client';

import { ManualProviderAdapter } from './manual-provider.adapter';
import { MockProviderAdapter } from './mock-provider.adapter';
import { ProviderAdapter } from './provider-adapter';

export const PROVIDER_ADAPTER_RESOLVER = Symbol('PROVIDER_ADAPTER_RESOLVER');

export interface ProviderAdapterResolver {
  resolve(provider: Provider | null): ProviderAdapter;
}

@Injectable()
export class ProviderAdapterRegistry implements ProviderAdapterResolver {
  constructor(
    private readonly manual: ManualProviderAdapter,
    private readonly mock: MockProviderAdapter,
  ) {}

  resolve(provider: Provider | null): ProviderAdapter {
    if (provider?.type === ProviderType.MANUAL || provider === null) return this.manual;
    return this.mock;
  }
}
