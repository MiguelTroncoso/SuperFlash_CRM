import { randomUUID } from 'node:crypto';

import { BridgeApiStatus, BridgeMessage } from './types.js';
import { signBody } from './signature.js';

interface ApiClientConfiguration {
  readonly apiUrl: string;
  readonly secret: string;
  readonly channelKey: string;
}

export class BridgeApiClient {
  constructor(private readonly configuration: ApiClientConfiguration) {}

  requestId(): string {
    return randomUUID();
  }

  status(status: BridgeApiStatus): Promise<void> {
    return this.post('/communication/internal/whatsapp-web-bridge/status', status);
  }

  heartbeat(status?: string): Promise<void> {
    return this.post('/communication/internal/whatsapp-web-bridge/heartbeat', {
      ...(status ? { status } : {}),
      requestId: this.requestId(),
    });
  }

  qr(qr: string, expiresAt: string): Promise<void> {
    return this.post('/communication/internal/whatsapp-web-bridge/qr', {
      qr,
      expiresAt,
      requestId: this.requestId(),
    });
  }

  message(message: BridgeMessage): Promise<void> {
    return this.post('/communication/internal/whatsapp-web-bridge/messages', message);
  }

  private async post(path: string, body: object): Promise<void> {
    const serialized = JSON.stringify(body);
    const timestamp = String(Date.now());
    const requestIdValue = (body as { readonly requestId?: unknown }).requestId;
    const requestId = typeof requestIdValue === 'string' ? requestIdValue : this.requestId();
    const response = await fetch(`${this.configuration.apiUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-superflash-bridge-timestamp': timestamp,
        'x-superflash-bridge-signature': signBody(this.configuration.secret, serialized, timestamp),
        'x-superflash-bridge-channel-key': this.configuration.channelKey,
        'x-request-id': requestId,
      },
      body: serialized,
    });
    if (!response.ok) throw new Error(`API bridge respondió HTTP ${response.status}.`);
  }
}
