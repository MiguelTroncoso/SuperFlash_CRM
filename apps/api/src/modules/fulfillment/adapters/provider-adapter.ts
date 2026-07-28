import { Provider, ProviderType } from '@prisma/client';

export interface ProviderAdapterContext {
  organizationId: string;
  providerId: string | null;
  fulfillmentId: string;
  requestId: string;
}

export interface ProvisioningRequest {
  snapshot: Record<string, unknown>;
  quantity: string;
  context: ProviderAdapterContext;
}

export interface ProvisioningResult {
  success: boolean;
  retryable: boolean;
  resultSnapshot?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface ProviderAdapter {
  readonly type: ProviderType | 'MOCK';
  validateConfiguration(provider: Provider | null): Promise<void>;
  healthCheck(provider: Provider | null): Promise<{ healthy: boolean }>;
  provision(request: ProvisioningRequest, provider: Provider | null): Promise<ProvisioningResult>;
  suspend(context: ProviderAdapterContext, provider: Provider | null): Promise<ProvisioningResult>;
  reactivate(
    context: ProviderAdapterContext,
    provider: Provider | null,
  ): Promise<ProvisioningResult>;
  cancel(context: ProviderAdapterContext, provider: Provider | null): Promise<ProvisioningResult>;
  fetchStatus(
    context: ProviderAdapterContext,
    provider: Provider | null,
  ): Promise<{ status: string }>;
}
