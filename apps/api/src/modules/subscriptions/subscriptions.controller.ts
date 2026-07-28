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

import { requestIdOf } from '../../infrastructure/http/request-correlation';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CommercialRequestContext } from '../commercial/commercial.types';
import {
  CancelSubscriptionDto,
  CreateSubscriptionDto,
  ListSubscriptionsQueryDto,
} from './dto/subscriptions.dto';
import { SubscriptionsService } from './subscriptions.service';

function requestContext(user: AuthenticatedUser, request: Request): CommercialRequestContext {
  const ipAddress = request.ip;
  const userAgent = request.get('user-agent')?.slice(0, 512);
  return {
    user,
    metadata: {
      ...(ipAddress ? { ipAddress } : {}),
      ...(userAgent ? { userAgent } : {}),
      requestId: requestIdOf(request),
    },
  };
}

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Post('from-sale-item/:saleItemId')
  @Permissions('subscriptions.create')
  @ApiOperation({ summary: 'Crea una suscripción desde un SaleItem snapshot' })
  create(
    @Param('saleItemId', ParseUUIDPipe) saleItemId: string,
    @Body() dto: CreateSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.createFromSaleItem(saleItemId, dto, requestContext(user, request));
  }

  @Get()
  @Permissions('subscriptions.read')
  list(
    @Query() query: ListSubscriptionsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('subscriptions.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(id, user);
  }

  @Post(':id/activate')
  @Permissions('subscriptions.update')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.activate(id, requestContext(user, request));
  }

  @Post(':id/suspend')
  @Permissions('subscriptions.update')
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.suspend(id, requestContext(user, request));
  }

  @Post(':id/expire')
  @Permissions('subscriptions.update')
  expire(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.expire(id, requestContext(user, request));
  }

  @Post(':id/cancel')
  @Permissions('subscriptions.update')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.cancel(id, dto, requestContext(user, request));
  }
}
