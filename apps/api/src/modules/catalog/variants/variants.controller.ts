import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { CreateVariantDto, ReorderDto, UpdateVariantDto } from '../dto/catalog.dto';
import { VariantsService } from './variants.service';

@ApiTags('catalog-variants')
@ApiBearerAuth()
@Controller('catalog/products/:productId/variants')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VariantsController {
  constructor(private readonly service: VariantsService) {}
  @Post()
  @Permissions('catalog.create')
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateVariantDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(productId, dto, this.context(user, request));
  }
  @Get()
  @Permissions('catalog.read')
  list(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>[]> {
    return this.service.list(productId, user);
  }
  @Get(':variantId')
  @Permissions('catalog.read')
  findOne(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(productId, variantId, user);
  }
  @Patch(':variantId')
  @Permissions('catalog.update')
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.update(productId, variantId, dto, this.context(user, request));
  }
  @Post(':variantId/archive')
  @Permissions('catalog.delete')
  archive(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.archive(productId, variantId, this.context(user, request));
  }
  @Post(':variantId/restore')
  @Permissions('catalog.delete')
  restore(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.restore(productId, variantId, this.context(user, request));
  }
  @Patch(':variantId/reorder')
  @Permissions('catalog.update')
  reorder(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>[]> {
    return this.service.reorder(productId, variantId, dto, this.context(user, request));
  }
  private context(user: AuthenticatedUser, request: Request): CatalogRequestContext {
    return { user, metadata: requestMetadata(request) };
  }
}
