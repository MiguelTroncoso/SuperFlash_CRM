import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { requestIdOf } from '../../infrastructure/http/request-correlation';
import { CommunicationMetricsService } from './services/communication-metrics.service';
import { WhatsAppChannelProvider } from './providers/whatsapp/whatsapp-channel.provider';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Controller('integrations/communication/whatsapp/webhook')
export class CommunicationWebhookController {
  constructor(
    private readonly whatsapp: WhatsAppChannelProvider,
    private readonly metrics: CommunicationMetricsService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const validChallenge = await this.whatsapp.verifyWebhook(mode, verifyToken, challenge);
      this.metrics.increment('webhook_verifications');
      response.status(200).type('text/plain').send(validChallenge);
    } catch (error: unknown) {
      this.metrics.increment('webhook_verification_failures');
      throw error;
    }
  }

  @Post()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async receive(@Req() request: RawBodyRequest, @Res() response: Response): Promise<void> {
    try {
      const signature = request.header('x-hub-signature-256');
      const result = await this.whatsapp.receiveWebhook({
        body: request.body as unknown,
        ...(request.rawBody ? { rawBody: request.rawBody } : {}),
        ...(signature ? { signature } : {}),
        requestId: requestIdOf(request),
      });
      this.metrics.increment('events_received');
      response.status(200).json(result);
    } catch (error: unknown) {
      this.metrics.increment('events_failed');
      throw error;
    }
  }
}
