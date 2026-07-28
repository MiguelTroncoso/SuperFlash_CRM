import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { CatalogRequestContext } from '../catalog.types';
import { requestMetadata } from '../catalog.http';
import {
  CreatePriceEntryDto,
  PriceEntryListQueryDto,
  UpdatePriceEntryDto,
} from '../dto/catalog.dto';
import { PricesService } from './prices.service';

@ApiTags('catalog-prices')
@ApiBearerAuth()
@Controller('catalog/price-books/:priceBookId/entries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PricesController {
  constructor(private readonly service: PricesService) {}
  @Post()
  @Permissions('catalog.prices.manage')
  create(
    @Param('priceBookId', ParseUUIDPipe) priceBookId: string,
    @Body() dto: CreatePriceEntryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(priceBookId, dto, this.context(user, request));
  }
  @Get()
  @Permissions('catalog.prices.read')
  list(
    @Param('priceBookId', ParseUUIDPipe) priceBookId: string,
    @Query() query: PriceEntryListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>[]> {
    return this.service.list(priceBookId, query.includeCosts, user);
  }
  @Get(':entryId')
  @Permissions('catalog.prices.read')
  findOne(
    @Param('priceBookId', ParseUUIDPipe) priceBookId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(priceBookId, entryId, user);
  }
  @Patch(':entryId')
  @Permissions('catalog.prices.manage')
  update(
    @Param('priceBookId', ParseUUIDPipe) priceBookId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: UpdatePriceEntryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.update(priceBookId, entryId, dto, this.context(user, request));
  }
  @Post(':entryId/archive')
  @Permissions('catalog.prices.manage')
  archive(
    @Param('priceBookId', ParseUUIDPipe) priceBookId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.archive(priceBookId, entryId, this.context(user, request));
  }
  @Post(':entryId/restore')
  @Permissions('catalog.prices.manage')
  restore(
    @Param('priceBookId', ParseUUIDPipe) priceBookId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.restore(priceBookId, entryId, this.context(user, request));
  }
  @Get(':entryId/history')
  @Permissions('catalog.prices.read')
  history(
    @Param('priceBookId', ParseUUIDPipe) priceBookId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>[]> {
    return this.service.history(priceBookId, entryId, user);
  }
  private context(user: AuthenticatedUser, request: Request): CatalogRequestContext {
    return { user, metadata: requestMetadata(request) };
  }
}
