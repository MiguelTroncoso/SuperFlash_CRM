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
import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CommercialRequestContext } from '../commercial/commercial.types';
import { CreatePaymentDto, ListPaymentsQueryDto, RefundPaymentDto } from './dto/payments.dto';
import { PaymentsService } from './payments.service';

function context(user: AuthenticatedUser, request: Request): CommercialRequestContext {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
  const ipAddress = forwardedIp || request.ip;
  const userAgent = request.get('user-agent')?.slice(0, 512);
  const metadata: RequestMetadata = {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
    requestId: requestIdOf(request),
  };
  return { user, metadata };
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post('sales/:saleId/payments')
  @Permissions('payments.create')
  @ApiOperation({ summary: 'Registra un pago pendiente para una venta' })
  create(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(saleId, dto, context(user, request));
  }

  @Get('payments')
  @Permissions('payments.read')
  list(
    @Query() query: ListPaymentsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(query, user);
  }

  @Get('payments/:id')
  @Permissions('payments.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(id, user);
  }

  @Post('payments/:id/confirm')
  @Permissions('payments.update')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.confirm(id, context(user, request));
  }

  @Post('payments/:id/fail')
  @Permissions('payments.update')
  fail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.fail(id, context(user, request));
  }

  @Post('payments/:id/refund')
  @Permissions('payments.update')
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.refund(id, dto, context(user, request));
  }
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller('sales/:saleId/payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalePaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  @Permissions('payments.read')
  listForSale(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(
      { page: 1, limit: 100, saleId, sortBy: 'createdAt', sortOrder: 'desc' },
      user,
    );
  }
}
