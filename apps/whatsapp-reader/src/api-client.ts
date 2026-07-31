import { randomUUID } from 'node:crypto';

interface ReaderConfig {
  readonly apiUrl: string;
  readonly token: string;
  readonly organizationId: string;
}

export interface ReaderMessage {
  readonly externalMessageId: string;
  readonly phone: string;
  readonly phoneNormalized: string;
  readonly contactName?: string;
  readonly type: string;
  readonly text?: string;
  readonly mediaMimeType?: string;
  readonly mediaFilename?: string;
  readonly caption?: string;
  readonly location?: Record<string, unknown>;
  readonly occurredAt: string;
  readonly requestId: string;
}

export class ReaderApiClient {
  private readonly config: ReaderConfig;

  constructor() {
    const apiUrl = process.env.READER_API_URL?.trim() || 'http://api:3001/api/v1';
    const token = process.env.WHATSAPP_READER_SERVICE_TOKEN?.trim();
    const organizationId = process.env.WHATSAPP_READER_ORGANIZATION_ID?.trim();
    if (!token || !organizationId)
      throw new Error(
        'Reader requiere WHATSAPP_READER_SERVICE_TOKEN y WHATSAPP_READER_ORGANIZATION_ID.',
      );
    this.config = { apiUrl: apiUrl.replace(/\/$/, ''), token, organizationId };
  }

  async status(status: string, details: Record<string, unknown> = {}): Promise<void> {
    await this.post('/communication/internal/whatsapp-web/status', {
      organizationId: this.config.organizationId,
      status,
      ...details,
    });
  }

  async qr(qr: string, expiresAt: string): Promise<void> {
    await this.post('/communication/internal/whatsapp-web/qr', {
      organizationId: this.config.organizationId,
      qr,
      expiresAt,
    });
  }

  async message(message: ReaderMessage): Promise<void> {
    await this.post('/communication/internal/whatsapp-web/messages', {
      organizationId: this.config.organizationId,
      ...message,
    });
  }

  requestId(): string {
    return randomUUID();
  }

  private async post(path: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${this.config.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
        'X-Request-ID': this.requestId(),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`API reader endpoint ${path} respondió HTTP ${response.status}.`);
  }
}
