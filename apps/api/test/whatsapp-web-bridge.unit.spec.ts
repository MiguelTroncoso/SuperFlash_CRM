import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

import { WhatsAppWebBridgeSecurity } from '../src/modules/communication/providers/whatsapp-web-bridge/whatsapp-web-bridge.security';
import { mapBridgeMessageType } from '../src/modules/communication/providers/whatsapp-web-bridge/whatsapp-web-bridge.types';

describe('WhatsApp Web bridge security', () => {
  it('accepts a current HMAC request and rejects tampering', () => {
    const secret = 'bridge-secret';
    const body = JSON.stringify({ requestId: 'request-1' });
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const request = {
      header: (name: string): string | undefined =>
        ({
          'x-superflash-bridge-timestamp': timestamp,
          'x-superflash-bridge-signature': signature,
          'x-superflash-bridge-channel-key': 'channel-1',
          'x-request-id': 'request-1',
        })[name],
    } as unknown as Request;
    const config = {
      getOrThrow: () => ({
        whatsappWebBridge: {
          enabled: true,
          apiUrl: 'http://bridge:3020',
          internalSecret: secret,
          channelKey: 'channel-1',
          sessionEncryptionKeyConfigured: true,
          missing: [],
        },
      }),
    } as unknown as ConfigService;
    const security = new WhatsAppWebBridgeSecurity(config);

    expect(security.verify(request, body).requestId).toBe('request-1');
    expect(() => security.verify(request, `${body}x`)).toThrow();
  });

  it('preserves a known sticker message type', () => {
    expect(mapBridgeMessageType('STICKER')).toBe('STICKER');
    expect(mapBridgeMessageType('TEXT')).toBe('TEXT');
  });
});
