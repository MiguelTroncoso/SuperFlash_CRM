import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

import { AppConfiguration } from '../../../../config/configuration';

const MAX_CLOCK_SKEW_SECONDS = 300;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface VerifiedBridgeRequest {
  readonly channelKey: string;
  readonly requestId: string;
  readonly signature: string;
}

@Injectable()
export class WhatsAppWebBridgeSecurity {
  private readonly configuration: AppConfiguration['whatsappWebBridge'];

  constructor(config: ConfigService) {
    this.configuration = config.getOrThrow<AppConfiguration>('app').whatsappWebBridge;
  }

  verify(request: Request, rawBody: string): VerifiedBridgeRequest {
    const timestamp = request.header('x-superflash-bridge-timestamp')?.trim() ?? '';
    const signature = request.header('x-superflash-bridge-signature')?.trim() ?? '';
    const channelKey = request.header('x-superflash-bridge-channel-key')?.trim() ?? '';
    const requestId = request.header('x-request-id')?.trim() ?? '';
    const parsedTimestamp = Number(timestamp);
    const secret = this.configuration.internalSecret;
    if (
      !this.configuration.enabled ||
      !secret ||
      !channelKey ||
      !requestId ||
      !REQUEST_ID_PATTERN.test(requestId) ||
      !/^\d{10,13}$/.test(timestamp) ||
      !Number.isFinite(parsedTimestamp) ||
      Math.abs(Date.now() - (timestamp.length === 13 ? parsedTimestamp : parsedTimestamp * 1000)) >
        MAX_CLOCK_SKEW_SECONDS * 1000 ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      throw new UnauthorizedException('Solicitud interna del bridge inválida.');
    }
    const signedTimestamp = timestamp.length === 13 ? parsedTimestamp : parsedTimestamp * 1000;
    const expected = createHmac('sha256', secret)
      .update(`${Math.trunc(signedTimestamp)}.${rawBody}`, 'utf8')
      .digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');
    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new UnauthorizedException('Firma del bridge inválida.');
    }
    return { channelKey, requestId, signature };
  }

  headers(body: string, requestId: string): Record<string, string> {
    const timestamp = String(Date.now());
    const secret = this.configuration.internalSecret;
    if (!this.configuration.enabled || !secret || !this.configuration.channelKey) {
      throw new Error('Bridge WhatsApp Web no configurado.');
    }
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`, 'utf8')
      .digest('hex');
    return {
      'content-type': 'application/json',
      'x-superflash-bridge-timestamp': timestamp,
      'x-superflash-bridge-signature': signature,
      'x-superflash-bridge-channel-key': this.configuration.channelKey,
      'x-request-id': requestId,
    };
  }
}
