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
import { CreatePlanDto, ReorderDto, UpdatePlanDto } from '../dto/catalog.dto';
import { PlansService } from './plans.service';

@ApiTags('catalog-plans')
@ApiBearerAuth()
@Controller('catalog/products/:productId/plans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlansController {
  constructor(private readonly service: PlansService) {}
  @Post()
  @Permissions('catalog.create')
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreatePlanDto,
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
  @Get(':planId')
  @Permissions('catalog.read')
  findOne(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(productId, planId, user);
  }
  @Patch(':planId')
  @Permissions('catalog.update')
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.update(productId, planId, dto, this.context(user, request));
  }
  @Post(':planId/archive')
  @Permissions('catalog.delete')
  archive(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.archive(productId, planId, this.context(user, request));
  }
  @Post(':planId/restore')
  @Permissions('catalog.delete')
  restore(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.restore(productId, planId, this.context(user, request));
  }
  @Patch(':planId/reorder')
  @Permissions('catalog.update')
  reorder(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>[]> {
    return this.service.reorder(productId, planId, dto, this.context(user, request));
  }
  private context(user: AuthenticatedUser, request: Request): CatalogRequestContext {
    return { user, metadata: requestMetadata(request) };
  }
}
