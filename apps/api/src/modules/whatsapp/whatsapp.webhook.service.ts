import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CredentialEncryptionService } from '../credentials/credential-encryption.service';
import { WHATSAPP_ERROR_CODES, whatsappException } from './whatsapp.errors';
import {
  isRecord,
  arrayValue,
  recordValue,
  sanitizePayload,
  stringValue,
  toInputJson,
} from './whatsapp.types';

interface WhatsAppWebhookRequest {
  body: unknown;
  rawBody?: Buffer;
  signature?: string;
  requestId: string;
}

@Injectable()
export class WhatsAppWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async verify(
    mode: string | undefined,
    verifyToken: string | undefined,
    challenge: string | undefined,
  ): Promise<string> {
    if (mode !== 'subscribe' || !verifyToken || !challenge) {
      throw whatsappException(
        HttpStatus.FORBIDDEN,
        WHATSAPP_ERROR_CODES.WEBHOOK_INVALID_VERIFICATION,
        'La verificación del webhook no es válida.',
      );
    }
    const connections = await this.prisma.whatsAppConnection.findMany({
      where: { deletedAt: null },
      select: { webhookVerifyTokenEncrypted: true },
    });
    const valid = connections.some((connection) =>
      this.equalSecret(
        verifyToken,
        this.encryption.decrypt(connection.webhookVerifyTokenEncrypted),
      ),
    );
    if (!valid)
      throw whatsappException(
        HttpStatus.FORBIDDEN,
        WHATSAPP_ERROR_CODES.WEBHOOK_INVALID_VERIFICATION,
        'La verificación del webhook no es válida.',
      );
    return challenge;
  }

  async receive(request: WhatsAppWebhookRequest): Promise<{ received: true; duplicate: boolean }> {
    const payload = isRecord(request.body) ? request.body : {};
    const connection = await this.findConnection(payload);
    if (!connection)
      throw whatsappException(
        HttpStatus.UNAUTHORIZED,
        WHATSAPP_ERROR_CODES.CONNECTION_NOT_FOUND,
        'Conexión de WhatsApp no encontrada.',
      );
    const signature = request.signature ?? '';
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(payload), 'utf8');
    if (
      !this.verifySignature(
        signature,
        rawBody,
        this.encryption.decrypt(connection.appSecretEncrypted),
      )
    ) {
      throw whatsappException(
        HttpStatus.UNAUTHORIZED,
        WHATSAPP_ERROR_CODES.WEBHOOK_INVALID_SIGNATURE,
        'La firma del webhook no es válida.',
      );
    }
    const sanitized = sanitizePayload(payload);
    const eventKey = this.eventKey(payload, connection.phoneNumberId);
    try {
      const event = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.whatsAppWebhookEvent.create({
          data: {
            organizationId: connection.organizationId,
            connectionId: connection.id,
            eventKey,
            payload: sanitized,
            requestId: request.requestId,
          },
          select: { id: true },
        });
        await transaction.whatsAppConnection.update({
          where: {
            organizationId_id: { organizationId: connection.organizationId, id: connection.id },
          },
          data: { lastWebhookReceivedAt: new Date() },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: connection.organizationId,
          action: 'WHATSAPP_WEBHOOK_RECEIVED',
          tableName: 'WhatsAppWebhookEvent',
          recordId: created.id,
          newValue: toInputJson({ eventKey }),
          requestId: request.requestId,
        });
        await this.outbox.enqueueWithClient(transaction, {
          eventType: 'WhatsAppWebhookReceived',
          organizationId: connection.organizationId,
          aggregateType: 'WhatsAppWebhookEvent',
          aggregateId: created.id,
          requestId: request.requestId,
          payload: { webhookEventId: created.id },
        });
        return created;
      });
      return { received: true, duplicate: !event.id ? true : false };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return { received: true, duplicate: true };
      throw error;
    }
  }

  private async findConnection(payload: Record<string, unknown>) {
    const phoneNumberId = this.phoneNumberId(payload);
    if (!phoneNumberId) return null;
    return this.prisma.whatsAppConnection.findFirst({ where: { phoneNumberId, deletedAt: null } });
  }

  private phoneNumberId(payload: Record<string, unknown>): string | null {
    for (const entry of arrayValue(payload.entry)) {
      const entryRecord = recordValue(entry);
      for (const change of arrayValue(entryRecord?.changes)) {
        const changeRecord = recordValue(change);
        const value = recordValue(changeRecord?.value);
        const metadata = recordValue(value?.metadata);
        const id = stringValue(metadata?.phone_number_id);
        if (id) return id;
      }
    }
    return null;
  }

  private eventKey(payload: Record<string, unknown>, phoneNumberId: string): string {
    const keys: string[] = [];
    for (const entry of arrayValue(payload.entry)) {
      const entryRecord = recordValue(entry);
      for (const change of arrayValue(entryRecord?.changes)) {
        const value = recordValue(recordValue(change)?.value);
        for (const message of arrayValue(value?.messages)) {
          const id = stringValue(recordValue(message)?.id);
          if (id) keys.push(`message:${id}`);
        }
        for (const status of arrayValue(value?.statuses)) {
          const id = stringValue(recordValue(status)?.id);
          if (id)
            keys.push(`status:${id}:${stringValue(recordValue(status)?.status) ?? 'unknown'}`);
        }
      }
    }
    if (keys.length > 0) return `${phoneNumberId}:${keys.sort().join('|')}`;
    return `${phoneNumberId}:payload:${createHash('sha256')
      .update(JSON.stringify(sanitizePayload(payload)))
      .digest('hex')}`;
  }

  private verifySignature(signature: string, rawBody: Buffer, secret: string): boolean {
    if (!signature.startsWith('sha256=')) return false;
    const received = Buffer.from(signature.slice('sha256='.length), 'hex');
    const expected = createHmac('sha256', secret).update(rawBody).digest();
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  private equalSecret(left: string, right: string): boolean {
    const a = Buffer.from(left, 'utf8');
    const b = Buffer.from(right, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
