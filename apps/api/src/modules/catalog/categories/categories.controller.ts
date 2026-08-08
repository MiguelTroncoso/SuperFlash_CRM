import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, ReorderDto, UpdateCategoryDto } from '../dto/catalog.dto';
import { CatalogRequestContext } from '../catalog.types';
import { requestMetadata } from '../catalog.http';
import { Req } from '@nestjs/common';
import { Request } from 'express';

@ApiTags('catalog-categories')
@ApiBearerAuth()
@Controller('catalog/categories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Post()
  @Permissions('catalog.create')
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(dto, this.context(user, request));
  }

  @Post('quick')
  @Permissions('opportunities.create')
  createQuick(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.createQuick(dto, this.context(user, request));
  }

  @Get()
  @Permissions('catalog.read')
  list(@CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>[]> {
    return this.service.list(user);
  }

  @Get(':id')
  @Permissions('catalog.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('catalog.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.update(id, dto, this.context(user, request));
  }

  @Post(':id/archive')
  @Permissions('catalog.delete')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.archive(id, this.context(user, request));
  }

  @Post(':id/restore')
  @Permissions('catalog.delete')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.restore(id, this.context(user, request));
  }

  @Patch(':id/reorder')
  @Permissions('catalog.update')
  reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>[]> {
    return this.service.reorder(id, dto, this.context(user, request));
  }

  private context(user: AuthenticatedUser, request: Request): CatalogRequestContext {
    return { user, metadata: requestMetadata(request) };
  }
}
