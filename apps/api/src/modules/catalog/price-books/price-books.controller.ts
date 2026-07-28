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
import { CreatePriceBookDto, PriceBookListQueryDto, UpdatePriceBookDto } from '../dto/catalog.dto';
import { PriceBooksService } from './price-books.service';

@ApiTags('catalog-price-books')
@ApiBearerAuth()
@Controller('catalog/price-books')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PriceBooksController {
  constructor(private readonly service: PriceBooksService) {}
  @Post()
  @Permissions('catalog.prices.manage')
  create(
    @Body() dto: CreatePriceBookDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(dto, this.context(user, request));
  }
  @Get()
  @Permissions('catalog.prices.read')
  list(
    @Query() query: PriceBookListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>[]> {
    return this.service.list(query, user);
  }
  @Get(':id')
  @Permissions('catalog.prices.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(id, user);
  }
  @Patch(':id')
  @Permissions('catalog.prices.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceBookDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.update(id, dto, this.context(user, request));
  }
  @Post(':id/activate')
  @Permissions('catalog.prices.manage')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.activate(id, this.context(user, request));
  }
  @Post(':id/deactivate')
  @Permissions('catalog.prices.manage')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.deactivate(id, this.context(user, request));
  }
  @Post(':id/archive')
  @Permissions('catalog.prices.manage')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.archive(id, this.context(user, request));
  }
  @Post(':id/restore')
  @Permissions('catalog.prices.manage')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.restore(id, this.context(user, request));
  }
  @Post(':id/set-default')
  @Permissions('catalog.prices.manage')
  setDefault(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.setDefault(id, this.context(user, request));
  }
  private context(user: AuthenticatedUser, request: Request): CatalogRequestContext {
    return { user, metadata: requestMetadata(request) };
  }
}
