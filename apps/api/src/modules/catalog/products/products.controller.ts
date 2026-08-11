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
import { AnyPermissions } from '../../auth/decorators/any-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { CatalogRequestContext } from '../catalog.types';
import { requestMetadata } from '../catalog.http';
import {
  AdjustStockDto,
  CreateProductDto,
  ProductListQueryDto,
  StockMovementListQueryDto,
  UpdateProductDto,
} from '../dto/catalog.dto';
import { ProductsService } from './products.service';

@ApiTags('catalog-products')
@ApiBearerAuth()
@Controller('catalog/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Post()
  @Permissions('catalog.create')
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(dto, this.context(user, request));
  }

  @Post('quick')
  @AnyPermissions('opportunities.create', 'catalog.create')
  createQuick(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.createQuick(dto, this.context(user, request));
  }
  @Get()
  @Permissions('catalog.read')
  list(
    @Query() query: ProductListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(query, user);
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
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.update(id, dto, this.context(user, request));
  }

  @Get(':id/stock')
  @Permissions('catalog.read')
  stock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.getStock(id, user);
  }

  @Post(':id/stock/adjust')
  @Permissions('catalog.update')
  adjustStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.adjustStock(id, dto, this.context(user, request));
  }

  @Get(':id/stock/movements')
  @Permissions('catalog.read')
  stockMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StockMovementListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.listStockMovements(id, query, user);
  }
  @Post(':id/activate')
  @Permissions('catalog.update')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.activate(id, this.context(user, request));
  }
  @Post(':id/deactivate')
  @Permissions('catalog.update')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.deactivate(id, this.context(user, request));
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
  private context(user: AuthenticatedUser, request: Request): CatalogRequestContext {
    return { user, metadata: requestMetadata(request) };
  }
}
