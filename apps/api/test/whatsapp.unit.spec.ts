import { ConfigService } from '@nestjs/config';
import { validateSync } from 'class-validator';
import { createHmac } from 'node:crypto';

import { CredentialEncryptionService } from '../src/modules/credentials/credential-encryption.service';
import { WhatsAppGraphApiClient } from '../src/modules/whatsapp/whatsapp.graph-api.client';
import {
  SendWhatsAppMessageDto,
  WhatsAppOutboundType,
} from '../src/modules/whatsapp/dto/whatsapp.dto';
import { WhatsAppWebhookService } from '../src/modules/whatsapp/whatsapp.webhook.service';
import { sanitizePayload } from '../src/modules/whatsapp/whatsapp.types';

describe('WhatsApp Cloud API primitives', () => {
  const encryption = new CredentialEncryptionService(
    new ConfigService({
      app: { credentialEncryptionKey: 'whatsapp-unit-key-that-is-long-enough-32' },
    }),
  );

  it('cifra secretos sin conservar el valor en texto plano', () => {
    const encrypted = encryption.encrypt('meta-access-token');
    expect(encrypted).not.toContain('meta-access-token');
    expect(encryption.decrypt(encrypted)).toBe('meta-access-token');
  });

  it('sanitiza tokens dentro de payloads webhook', () => {
    expect(
      sanitizePayload({ message: 'ok', access_token: 'secret', nested: { password: 'hidden' } }),
    ).toEqual({ message: 'ok', access_token: '[redacted]', nested: { password: '[redacted]' } });
  });

  it('rechaza un outbound sin tipo', () => {
    expect(validateSync(Object.assign(new SendWhatsAppMessageDto(), {})).length).toBeGreaterThan(0);
  });

  it('acepta un outbound de texto', () => {
    const dto = Object.assign(new SendWhatsAppMessageDto(), {
      type: WhatsAppOutboundType.TEXT,
      text: 'Hola',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('acepta un outbound de plantilla', () => {
    const dto = Object.assign(new SendWhatsAppMessageDto(), {
      type: WhatsAppOutboundType.TEMPLATE,
      templateName: 'hello_world',
      templateLanguage: 'es',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('consume la respuesta Graph sin exponer el token en el resultado', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'phone-1',
          display_phone_number: '+56912345678',
          verified_name: 'SuperFlash',
          quality_rating: 'GREEN',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await new WhatsAppGraphApiClient().testConnection({
      graphApiVersion: 'v23.0',
      phoneNumberId: 'phone-1',
      accessToken: 'secret-token',
    });
    expect(result).toMatchObject({ id: 'phone-1', displayPhoneNumber: '+56912345678' });
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it('verifica un verify token válido y rechaza otro', async () => {
    const prisma = {
      whatsAppConnection: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ webhookVerifyTokenEncrypted: encryption.encrypt('verify-token') }]),
      },
    };
    const service = new WhatsAppWebhookService(
      prisma as never,
      {} as never,
      {} as never,
      encryption,
    );
    await expect(service.verify('subscribe', 'verify-token', 'challenge')).resolves.toBe(
      'challenge',
    );
    await expect(service.verify('subscribe', 'wrong', 'challenge')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('valida la firma HMAC del webhook y no acepta firmas alteradas', async () => {
    const secret = 'app-secret';
    const body = Buffer.from(
      JSON.stringify({
        entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-1' } } }] }],
      }),
    );
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    const encryptionForSecret = new CredentialEncryptionService(
      new ConfigService({
        app: { credentialEncryptionKey: 'whatsapp-unit-key-that-is-long-enough-32' },
      }),
    );
    const transaction = {
      whatsAppWebhookEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
      whatsAppConnection: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      whatsAppConnection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'connection-1',
          organizationId: 'org-1',
          phoneNumberId: 'phone-1',
          appSecretEncrypted: encryptionForSecret.encrypt(secret),
        }),
      },
      $transaction: jest.fn(async (callback: (transaction: never) => Promise<unknown>) =>
        callback(transaction as never),
      ),
    };
    const service = new WhatsAppWebhookService(
      prisma as never,
      { enqueueWithClient: jest.fn() } as never,
      { recordWithClient: jest.fn() } as never,
      encryptionForSecret,
    );
    await expect(
      service.receive({
        body: JSON.parse(body.toString()) as unknown,
        rawBody: body,
        signature,
        requestId: 'request-1',
      }),
    ).resolves.toEqual({ received: true, duplicate: false });
    await expect(
      service.receive({
        body: JSON.parse(body.toString()) as unknown,
        rawBody: body,
        signature: `${signature.slice(0, -1)}0`,
        requestId: 'request-1',
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
