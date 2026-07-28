import { ConfigService } from '@nestjs/config';
import { validateSync } from 'class-validator';
import { ProviderType } from '@prisma/client';

import { CredentialEncryptionService } from '../src/modules/credentials/credential-encryption.service';
import { ManualProviderAdapter } from '../src/modules/fulfillment/adapters/manual-provider.adapter';
import { MockProviderAdapter } from '../src/modules/fulfillment/adapters/mock-provider.adapter';
import { ProviderAdapterRegistry } from '../src/modules/fulfillment/adapters/provider-adapter.registry';
import {
  CreateFulfillmentDto,
  ProvisionFulfillmentDto,
} from '../src/modules/fulfillment/dto/fulfillment.dto';
import { assertNoSecrets, publicId, safeObject } from '../src/modules/operations/operations.types';
import { CreateProviderDto } from '../src/modules/providers/dto/providers.dto';
import { CreateTrialDto } from '../src/modules/trials/dto/trials.dto';

describe('operations security primitives', () => {
  const encryption = new CredentialEncryptionService(
    new ConfigService({ app: { credentialEncryptionKey: 'unit-test-key-that-is-long-enough-32' } }),
  );

  it('encrypts a credential value', () =>
    expect(encryption.encrypt('password')).not.toContain('password'));
  it('decrypts a credential value', () =>
    expect(encryption.decrypt(encryption.encrypt('password'))).toBe('password'));
  it('uses a fresh IV per encryption', () =>
    expect(encryption.encrypt('same')).not.toBe(encryption.encrypt('same')));
  it('round trips empty values', () => expect(encryption.decrypt(encryption.encrypt(''))).toBe(''));
  it('round trips unicode values', () =>
    expect(encryption.decrypt(encryption.encrypt('contraseña 🔐'))).toBe('contraseña 🔐'));
  it('round trips long values', () => {
    const value = 'x'.repeat(2_000);
    expect(encryption.decrypt(encryption.encrypt(value))).toBe(value);
  });
  it('rejects malformed ciphertext', () => expect(() => encryption.decrypt('bad')).toThrow());
  it('rejects tampered ciphertext', () => {
    const parts = encryption.encrypt('secret').split(':');
    const ciphertext = parts[3] ?? '';
    parts[3] = `${ciphertext.slice(0, -1)}${ciphertext.endsWith('A') ? 'B' : 'A'}`;
    expect(() => encryption.decrypt(parts.join(':'))).toThrow();
  });
  it('rejects an unknown encryption version', () => {
    const parts = encryption.encrypt('secret').split(':');
    parts[0] = 'v2';
    expect(() => encryption.decrypt(parts.join(':'))).toThrow();
  });
  it('does not expose the key in ciphertext', () =>
    expect(encryption.encrypt('unit-test-key-that-is-long-enough-32')).not.toContain(
      'unit-test-key',
    ));

  it('allows ordinary provider metadata', () =>
    expect(() => assertNoSecrets({ region: 'cl', priority: 1 })).not.toThrow());
  it('rejects password metadata', () =>
    expect(() => assertNoSecrets({ password: 'secret' })).toThrow());
  it('rejects nested token metadata', () =>
    expect(() => assertNoSecrets({ config: { accessToken: 'secret' } })).toThrow());
  it('rejects secrets in arrays', () =>
    expect(() => assertNoSecrets([{ privateKey: 'secret' }])).toThrow());
  it('rejects api keys with underscore', () =>
    expect(() => assertNoSecrets({ api_key: 'secret' })).toThrow());
  it('rejects credential-shaped keys', () =>
    expect(() => assertNoSecrets({ credentialValue: 'secret' })).toThrow());
  it('accepts null metadata', () => expect(() => assertNoSecrets(null)).not.toThrow());
  it('accepts scalar array metadata values', () =>
    expect(() => assertNoSecrets(['manual', 1, true])).not.toThrow());
  it('preserves public ids', () => {
    expect(publicId('id')).toBe('id');
    expect(publicId(null)).toBeNull();
  });
  it('creates an object suitable for Prisma JSON', () =>
    expect(safeObject({ event: 'created' })).toEqual({ event: 'created' }));

  it('manual adapter validates successfully', async () => {
    await expect(new ManualProviderAdapter().validateConfiguration(null)).resolves.toBeUndefined();
  });
  it('manual adapter reports healthy', async () => {
    await expect(new ManualProviderAdapter().healthCheck(null)).resolves.toEqual({ healthy: true });
  });
  it('manual adapter provisions without external calls', async () => {
    await expect(
      new ManualProviderAdapter().provision(
        {
          snapshot: {},
          quantity: '1',
          context: {
            organizationId: 'org',
            providerId: null,
            fulfillmentId: 'fulfillment',
            requestId: 'request',
          },
        },
        null,
      ),
    ).resolves.toMatchObject({ success: true });
  });
  it('manual adapter supports suspend', async () => {
    await expect(
      new ManualProviderAdapter().suspend(
        { organizationId: 'org', providerId: null, fulfillmentId: 'f', requestId: 'r' },
        null,
      ),
    ).resolves.toMatchObject({ success: true });
  });
  it('manual adapter supports reactivate', async () => {
    await expect(
      new ManualProviderAdapter().reactivate(
        { organizationId: 'org', providerId: null, fulfillmentId: 'f', requestId: 'r' },
        null,
      ),
    ).resolves.toMatchObject({ success: true });
  });
  it('manual adapter supports cancel', async () => {
    await expect(
      new ManualProviderAdapter().cancel(
        { organizationId: 'org', providerId: null, fulfillmentId: 'f', requestId: 'r' },
        null,
      ),
    ).resolves.toMatchObject({ success: true });
  });
  it('manual adapter reports status', async () => {
    await expect(
      new ManualProviderAdapter().fetchStatus(
        { organizationId: 'org', providerId: null, fulfillmentId: 'f', requestId: 'r' },
        null,
      ),
    ).resolves.toEqual({ status: 'manual:f' });
  });
  it('mock adapter provisions with a mock reference', async () => {
    await expect(
      new MockProviderAdapter().provision(
        {
          snapshot: {},
          quantity: '1',
          context: {
            organizationId: 'org',
            providerId: 'provider',
            fulfillmentId: 'f',
            requestId: 'r',
          },
        },
        null,
      ),
    ).resolves.toMatchObject({ resultSnapshot: { mode: 'MOCK' } });
  });
  it('mock adapter reports healthy', async () => {
    await expect(new MockProviderAdapter().healthCheck(null)).resolves.toEqual({ healthy: true });
  });
  it('registry resolves manual providers', () =>
    expect(
      new ProviderAdapterRegistry(new ManualProviderAdapter(), new MockProviderAdapter()).resolve(
        null,
      ).type,
    ).toBe(ProviderType.MANUAL));
  it('registry resolves non-manual providers through mock boundary', () => {
    const provider = { type: ProviderType.API } as Parameters<
      ProviderAdapterRegistry['resolve']
    >[0];
    expect(
      new ProviderAdapterRegistry(new ManualProviderAdapter(), new MockProviderAdapter()).resolve(
        provider,
      ).type,
    ).toBe('MOCK');
  });

  it('rejects fulfillment DTOs without a sale item', () =>
    expect(validateSync(Object.assign(new CreateFulfillmentDto(), {})).length).toBeGreaterThan(0));
  it('accepts fulfillment DTOs with a UUID sale item', () => {
    const dto = Object.assign(new CreateFulfillmentDto(), {
      saleItemId: '11111111-1111-4111-8111-111111111111',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });
  it('rejects malformed fulfillment idempotency keys only by length policy', () => {
    const dto = Object.assign(new CreateFulfillmentDto(), {
      saleItemId: '11111111-1111-4111-8111-111111111111',
      idempotencyKey: 'x'.repeat(201),
    });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
  it('accepts an optional provisioning idempotency key', () => {
    const dto = Object.assign(new ProvisionFulfillmentDto(), { idempotencyKey: 'request-1' });
    expect(validateSync(dto)).toHaveLength(0);
  });
  it('rejects a provider DTO without a name', () =>
    expect(
      validateSync(Object.assign(new CreateProviderDto(), { type: ProviderType.MANUAL })).length,
    ).toBeGreaterThan(0));
  it('rejects a provider DTO without a type', () =>
    expect(
      validateSync(Object.assign(new CreateProviderDto(), { name: 'Manual' })).length,
    ).toBeGreaterThan(0));
  it('accepts a valid provider DTO', () => {
    const dto = Object.assign(new CreateProviderDto(), {
      name: 'Manual',
      type: ProviderType.MANUAL,
    });
    expect(validateSync(dto)).toHaveLength(0);
  });
  it('rejects a trial DTO without product identity', () =>
    expect(
      validateSync(
        Object.assign(new CreateTrialDto(), { contactId: '00000000-0000-0000-0000-000000000001' }),
      ).length,
    ).toBeGreaterThan(0));
  it('rejects malformed trial contact ids', () =>
    expect(
      validateSync(
        Object.assign(new CreateTrialDto(), { contactId: 'not-uuid', productId: 'not-uuid' }),
      ).length,
    ).toBeGreaterThan(0));
  it('accepts trial UUID identity fields', () => {
    const dto = Object.assign(new CreateTrialDto(), {
      contactId: '11111111-1111-4111-8111-111111111111',
      productId: '22222222-2222-4222-8222-222222222222',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });
});
