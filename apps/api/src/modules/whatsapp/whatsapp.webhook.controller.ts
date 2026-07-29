import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { requestIdOf } from '../../infrastructure/http/request-correlation';
import { WhatsAppWebhookService } from './whatsapp.webhook.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Controller('integrations/whatsapp/webhook')
export class WhatsAppWebhookController {
  constructor(private readonly webhook: WhatsAppWebhookService) {}

  @Get()
  async verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const validChallenge = await this.webhook.verify(mode, verifyToken, challenge);
    response.status(200).type('text/plain').send(validChallenge);
  }

  @Post()
  async receive(@Req() request: RawBodyRequest, @Res() response: Response): Promise<void> {
    const rawBody = request.rawBody;
    const signature = request.header('x-hub-signature-256');
    const result = await this.webhook.receive({
      body: request.body as unknown,
      ...(rawBody ? { rawBody } : {}),
      ...(signature ? { signature } : {}),
      requestId: requestIdOf(request),
    });
    response.status(200).json(result);
  }
}
