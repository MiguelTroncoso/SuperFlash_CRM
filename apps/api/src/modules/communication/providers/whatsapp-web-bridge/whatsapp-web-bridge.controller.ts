import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { requestIdOf } from '../../../../infrastructure/http/request-correlation';
import { AuthenticatedUser, RequestMetadata } from '../../../auth/auth.types';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/guards/permissions.guard';
import { WhatsAppWebBridgeSecurity } from './whatsapp-web-bridge.security';
import { WhatsAppWebBridgeService } from './whatsapp-web-bridge.service';
import {
  WhatsAppWebBridgeHeartbeatInput,
  WhatsAppWebBridgeMessageInput,
  WhatsAppWebBridgeQrInput,
  WhatsAppWebBridgeStatusInput,
} from './whatsapp-web-bridge.types';

function metadata(request: Request): RequestMetadata {
  return { requestId: requestIdOf(request), ...(request.ip ? { ipAddress: request.ip } : {}) };
}

function rawBody(request: Request): string {
  const value = (request as Request & { rawBody?: Buffer }).rawBody;
  return value?.toString('utf8') ?? JSON.stringify(request.body ?? {});
}

@ApiTags('communication-whatsapp-web-bridge')
@ApiBearerAuth()
@Controller('communication/channels/whatsapp-web-bridge')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsAppWebBridgeController {
  constructor(private readonly service: WhatsAppWebBridgeService) {}

  @Get('status')
  @Permissions('whatsapp.read')
  @ApiOperation({ summary: 'Estado del bridge WhatsApp Web de solo lectura' })
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.service.status(user);
  }

  @Post('enable')
  @HttpCode(200)
  @Permissions('whatsapp.manage')
  @ApiOperation({ summary: 'Habilita la ingesta del bridge WhatsApp Web' })
  enable(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.enable(user, metadata(request));
  }

  @Post('disable')
  @HttpCode(200)
  @Permissions('whatsapp.manage')
  @ApiOperation({ summary: 'Detiene la ingesta del bridge WhatsApp Web' })
  disable(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.disable(user, metadata(request));
  }

  @Post('pairing')
  @HttpCode(200)
  @Permissions('whatsapp.manage')
  @ApiOperation({ summary: 'Solicita un QR de pairing, sin persistirlo' })
  pairing(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.control(user, metadata(request), 'pair');
  }

  @Post('reconnect')
  @HttpCode(200)
  @Permissions('whatsapp.manage')
  reconnect(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.control(user, metadata(request), 'reconnect');
  }

  @Post('cancel')
  @HttpCode(200)
  @Permissions('whatsapp.manage')
  cancel(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.control(user, metadata(request), 'cancel');
  }

  @Post('unlink')
  @HttpCode(200)
  @Permissions('whatsapp.manage')
  unlink(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.control(user, metadata(request), 'unlink');
  }
}

@ApiTags('communication-whatsapp-web-bridge-internal')
@Controller('communication/internal/whatsapp-web-bridge')
export class WhatsAppWebBridgeInternalController {
  constructor(
    private readonly service: WhatsAppWebBridgeService,
    private readonly security: WhatsAppWebBridgeSecurity,
  ) {}

  @Post('qr')
  @HttpCode(200)
  qr(@Req() request: Request, @Body() body: WhatsAppWebBridgeQrInput) {
    const verified = this.authorize(request, body.requestId);
    return this.service
      .claimInternalRequest(verified.channelKey, verified.requestId, verified.signature)
      .then((channel) => this.service.receiveQr(channel, body));
  }

  @Post('status')
  @HttpCode(200)
  status(@Req() request: Request, @Body() body: WhatsAppWebBridgeStatusInput) {
    const verified = this.authorize(request, body.requestId);
    return this.service
      .claimInternalRequest(verified.channelKey, verified.requestId, verified.signature)
      .then((channel) => this.service.receiveStatus(channel, body));
  }

  @Post('heartbeat')
  @HttpCode(200)
  heartbeat(@Req() request: Request, @Body() body: WhatsAppWebBridgeHeartbeatInput) {
    const verified = this.authorize(request, body.requestId);
    return this.service
      .claimInternalRequest(verified.channelKey, verified.requestId, verified.signature)
      .then((channel) => this.service.receiveHeartbeat(channel, body));
  }

  @Post('messages')
  @HttpCode(200)
  messages(@Req() request: Request, @Body() body: WhatsAppWebBridgeMessageInput) {
    const verified = this.authorize(request, body.requestId);
    return this.service
      .claimInternalRequest(verified.channelKey, verified.requestId, verified.signature)
      .then((channel) => this.service.receiveMessage(channel, body));
  }

  private authorize(
    request: Request,
    bodyRequestId: string,
  ): ReturnType<WhatsAppWebBridgeSecurity['verify']> {
    const verified = this.security.verify(request, rawBody(request));
    if (verified.requestId !== bodyRequestId)
      throw new BadRequestException('El requestId del bridge no coincide con su cabecera.');
    return verified;
  }
}
