import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CommercialRequestContext } from '../commercial/commercial.types';
import { CancelRenewalDto, CreateRenewalDto, ListRenewalsQueryDto } from './dto/renewals.dto';
import { RenewalsService } from './renewals.service';

function requestContext(user: AuthenticatedUser, request: Request): CommercialRequestContext {
  const ipAddress = request.ip;
  const userAgent = request.get('user-agent')?.slice(0, 512);
  return {
    user,
    metadata: { ...(ipAddress ? { ipAddress } : {}), ...(userAgent ? { userAgent } : {}) },
  };
}

@ApiTags('renewals')
@ApiBearerAuth()
@Controller('renewals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RenewalsController {
  constructor(private readonly service: RenewalsService) {}

  @Post('from-subscription/:subscriptionId')
  @Permissions('renewals.create')
  @ApiOperation({ summary: 'Crea una renovación desde una suscripción' })
  create(
    @Param('subscriptionId', ParseUUIDPipe) subscriptionId: string,
    @Body() dto: CreateRenewalDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.createFromSubscription(subscriptionId, dto, requestContext(user, request));
  }

  @Get()
  @Permissions('renewals.read')
  list(
    @Query() query: ListRenewalsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('renewals.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(id, user);
  }

  @Post(':id/due')
  @Permissions('renewals.update')
  markDue(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.markDue(id, requestContext(user, request));
  }

  @Post(':id/pay')
  @Permissions('renewals.update')
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.pay(id, requestContext(user, request));
  }

  @Post(':id/cancel')
  @Permissions('renewals.update')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelRenewalDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.cancel(id, dto, requestContext(user, request));
  }
}
