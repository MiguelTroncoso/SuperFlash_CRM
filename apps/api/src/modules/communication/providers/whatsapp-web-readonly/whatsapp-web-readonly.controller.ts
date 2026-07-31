import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

import { AppConfiguration } from '../../../../config/configuration';
import { requestIdOf } from '../../../../infrastructure/http/request-correlation';
import { AuthenticatedUser, RequestMetadata } from '../../../auth/auth.types';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/guards/permissions.guard';
import { WhatsAppWebReadOnlyService } from './whatsapp-web-readonly.service';
import {
  WhatsAppWebMessageInput,
  WhatsAppWebQrInput,
  WhatsAppWebStatusInput,
} from './whatsapp-web-readonly.types';

function metadata(request: Request): RequestMetadata {
  return { requestId: requestIdOf(request), ...(request.ip ? { ipAddress: request.ip } : {}) };
}

@ApiTags('communication-whatsapp-web')
@ApiBearerAuth()
@Controller('communication/channels/whatsapp-web-read-only')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsAppWebReadOnlyController {
  constructor(private readonly service: WhatsAppWebReadOnlyService) {}

  @Get('status')
  @Permissions('whatsapp.read')
  @ApiOperation({ summary: 'Estado del lector WhatsApp Web exclusivamente de lectura' })
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.service.status(user.organizationId);
  }

  @Post('pairing')
  @HttpCode(200)
  @Permissions('whatsapp.manage')
  pairing(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.requestPairing(user, metadata(request));
  }

  @Post('reconnect')
  @HttpCode(200)
  @Permissions('whatsapp.manage')
  reconnect(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.reconnect(user, metadata(request));
  }

  @Post('cancel')
  @HttpCode(200)
  @Permissions('whatsapp.manage')
  cancel(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.cancelPairing(user, metadata(request));
  }

  @Post('unlink')
  @HttpCode(200)
  @Permissions('whatsapp.manage')
  unlink(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.unlink(user, metadata(request));
  }
}

@ApiTags('communication-whatsapp-web-internal')
@Controller('communication/internal/whatsapp-web')
export class WhatsAppWebReadOnlyInternalController {
  constructor(
    private readonly service: WhatsAppWebReadOnlyService,
    private readonly config: ConfigService,
  ) {}

  @Post('qr')
  @HttpCode(200)
  qr(@Req() request: Request, @Body() body: WhatsAppWebQrInput) {
    this.authorize(request);
    return this.service.receiveQr(this.organization(body), body);
  }

  @Post('status')
  @HttpCode(200)
  status(
    @Req() request: Request,
    @Body() body: WhatsAppWebStatusInput & { organizationId?: string },
  ) {
    this.authorize(request);
    return this.service.receiveStatus(this.organization(body), body);
  }

  @Post('messages')
  @HttpCode(200)
  messages(
    @Req() request: Request,
    @Body() body: WhatsAppWebMessageInput & { organizationId?: string },
  ) {
    this.authorize(request);
    return this.service.receiveMessage(this.organization(body), body);
  }

  private authorize(request: Request): void {
    const expected = this.config.getOrThrow<AppConfiguration>('app').whatsappReader.serviceToken;
    const authorization = request.headers.authorization;
    if (!expected || authorization !== `Bearer ${expected}`)
      throw new UnauthorizedException('Reader interno no autorizado.');
  }

  private organization(body: { organizationId?: string }): string {
    const configured =
      this.config.getOrThrow<AppConfiguration>('app').whatsappReader.organizationId;
    if (!configured || (body.organizationId && body.organizationId !== configured))
      throw new UnauthorizedException('Reader sin organización autorizada.');
    return configured;
  }
}
