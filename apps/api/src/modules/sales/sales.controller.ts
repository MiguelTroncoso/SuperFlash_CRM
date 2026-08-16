import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import {
  CancelSaleDto,
  ConfirmSaleDto,
  CreateSaleDto,
  ListSalesQueryDto,
  UpdateSaleDto,
} from './dto/sales.dto';
import { SalesService } from './sales.service';

function requestMetadata(request: Request): RequestMetadata {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
  const ipAddress = forwardedIp || request.ip;
  const userAgent = request.get('user-agent')?.slice(0, 512);
  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
    requestId: requestIdOf(request),
  };
}

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Post()
  @Permissions('sales.create')
  @ApiOperation({ summary: 'Crea una venta con snapshots de catálogo' })
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(dto, { user, metadata: requestMetadata(request) });
  }

  @Post('from-opportunity/:opportunityId')
  @Permissions('sales.create')
  @ApiOperation({ summary: 'Convierte una oportunidad en venta de forma idempotente' })
  convert(
    @Param('opportunityId', ParseUUIDPipe) opportunityId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.convertOpportunity(opportunityId, {
      user,
      metadata: requestMetadata(request),
    });
  }

  @Get()
  @Permissions('sales.read')
  list(
    @Query() query: ListSalesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('sales.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('sales.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.update(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/confirm')
  @Permissions('sales.update')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmSaleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.confirm(id, { user, metadata: requestMetadata(request) }, dto.payment);
  }

  @Post(':id/fulfill')
  @Permissions('sales.update')
  fulfill(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.fulfill(id, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/cancel')
  @Permissions('sales.update')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSaleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.cancel(id, dto.reason, { user, metadata: requestMetadata(request) });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('sales.delete')
  @ApiOperation({ summary: 'Elimina una venta mediante soft delete y reconcilia stock' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.service.remove(id, { user, metadata: requestMetadata(request) });
  }
}
