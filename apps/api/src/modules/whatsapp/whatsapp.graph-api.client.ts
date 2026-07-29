import { Injectable } from '@nestjs/common';

import { JsonRecord, isRecord, stringValue } from './whatsapp.types';

export class WhatsAppGraphApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly errorCode: string | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'WhatsAppGraphApiError';
  }
}

export interface WhatsAppGraphTemplate {
  externalId: string | null;
  name: string;
  language: string;
  category: string | null;
  status: string;
  components: unknown;
}

interface GraphResult {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messages?: Array<{ id?: string }>;
  data?: unknown[];
}

@Injectable()
export class WhatsAppGraphApiClient {
  private readonly timeoutMs = 15_000;

  async testConnection(input: {
    graphApiVersion: string;
    phoneNumberId: string;
    accessToken: string;
  }): Promise<{
    id: string;
    displayPhoneNumber: string;
    verifiedName: string | null;
    qualityRating: string | null;
  }> {
    const result = await this.request(
      input.graphApiVersion,
      `/${encodeURIComponent(input.phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating`,
      input.accessToken,
    );
    return {
      id: stringValue(result.id) ?? input.phoneNumberId,
      displayPhoneNumber: stringValue(result.display_phone_number) ?? '',
      verifiedName: stringValue(result.verified_name),
      qualityRating: stringValue(result.quality_rating),
    };
  }

  async sendMessage(input: {
    graphApiVersion: string;
    phoneNumberId: string;
    accessToken: string;
    to: string;
    body: JsonRecord;
  }): Promise<{ messageId: string | null }> {
    const result = await this.request(
      input.graphApiVersion,
      `/${encodeURIComponent(input.phoneNumberId)}/messages`,
      input.accessToken,
      { method: 'POST', body: input.body },
    );
    const messageId = result.messages?.[0]?.id;
    return { messageId: typeof messageId === 'string' ? messageId : null };
  }

  async listTemplates(input: {
    graphApiVersion: string;
    wabaId: string;
    accessToken: string;
  }): Promise<WhatsAppGraphTemplate[]> {
    const result = await this.request(
      input.graphApiVersion,
      `/${encodeURIComponent(input.wabaId)}/message_templates?fields=id,name,language,category,status,components&limit=100`,
      input.accessToken,
    );
    return (result.data ?? []).flatMap((item) => {
      if (!isRecord(item)) return [];
      const name = stringValue(item.name);
      const language = stringValue(item.language);
      if (!name || !language) return [];
      return [
        {
          externalId: stringValue(item.id),
          name,
          language,
          category: stringValue(item.category),
          status: stringValue(item.status) ?? 'UNKNOWN',
          components: item.components ?? null,
        },
      ];
    });
  }

  private async request(
    graphApiVersion: string,
    path: string,
    accessToken: string,
    options?: { method?: 'GET' | 'POST'; body?: JsonRecord },
  ): Promise<GraphResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`https://graph.facebook.com/${graphApiVersion}${path}`, {
        method: options?.method ?? 'GET',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
        const message = stringValue(error?.message) ?? 'La API de WhatsApp rechazó la solicitud.';
        const code = stringValue(error?.code);
        const retryable = response.status === 429 || response.status >= 500;
        throw new WhatsAppGraphApiError(message, response.status, code, retryable);
      }
      return isRecord(payload) ? (payload as GraphResult) : {};
    } catch (error: unknown) {
      if (error instanceof WhatsAppGraphApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WhatsAppGraphApiError(
          'La API de WhatsApp tardó demasiado en responder.',
          504,
          null,
          true,
        );
      }
      throw new WhatsAppGraphApiError(
        'No fue posible conectar con la API de WhatsApp.',
        503,
        null,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
