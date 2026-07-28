import { Injectable } from '@nestjs/common';
import { ProviderType, Provider } from '@prisma/client';

import {
  ProviderAdapter,
  ProviderAdapterContext,
  ProvisioningRequest,
  ProvisioningResult,
} from './provider-adapter';

@Injectable()
export class ManualProviderAdapter implements ProviderAdapter {
  readonly type = ProviderType.MANUAL;

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
        mode: 'MANUAL',
        fulfillmentId: request.context.fulfillmentId,
        reference: `manual-${request.context.fulfillmentId}`,
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
    return { status: `manual:${context.fulfillmentId}` };
  }
}
