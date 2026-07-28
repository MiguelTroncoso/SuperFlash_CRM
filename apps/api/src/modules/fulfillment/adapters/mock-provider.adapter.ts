import { Injectable } from '@nestjs/common';
import { Provider } from '@prisma/client';

import {
  ProviderAdapter,
  ProviderAdapterContext,
  ProvisioningRequest,
  ProvisioningResult,
} from './provider-adapter';

@Injectable()
export class MockProviderAdapter implements ProviderAdapter {
  readonly type = 'MOCK' as const;

  async validateConfiguration(_provider: Provider | null): Promise<void> {}
  async healthCheck(_provider: Provider | null): Promise<{ healthy: boolean }> {
    return { healthy: true };
  }
  async provision(
    request: ProvisioningRequest,
    _provider: Provider | null,
  ): Promise<ProvisioningResult> {
    return {
      success: true,
      retryable: false,
      resultSnapshot: {
        mode: 'MOCK',
        fulfillmentId: request.context.fulfillmentId,
        reference: `mock-${request.context.fulfillmentId}`,
      },
    };
  }
  async suspend(
    context: ProviderAdapterContext,
    _provider: Provider | null,
  ): Promise<ProvisioningResult> {
    return {
      success: true,
      retryable: false,
      resultSnapshot: { action: 'suspend', fulfillmentId: context.fulfillmentId },
    };
  }
  async reactivate(
    context: ProviderAdapterContext,
    _provider: Provider | null,
  ): Promise<ProvisioningResult> {
    return {
      success: true,
      retryable: false,
      resultSnapshot: { action: 'reactivate', fulfillmentId: context.fulfillmentId },
    };
  }
  async cancel(
    context: ProviderAdapterContext,
    _provider: Provider | null,
  ): Promise<ProvisioningResult> {
    return {
      success: true,
      retryable: false,
      resultSnapshot: { action: 'cancel', fulfillmentId: context.fulfillmentId },
    };
  }
  async fetchStatus(
    context: ProviderAdapterContext,
    _provider: Provider | null,
  ): Promise<{ status: string }> {
    return { status: `mock:${context.fulfillmentId}` };
  }
}
