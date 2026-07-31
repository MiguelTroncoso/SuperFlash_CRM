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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { requestIdOf } from '../../infrastructure/http/request-correlation';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FinancialService } from './financial.service';
import {
  CreateCategoryDto,
  CreateExpenseDto,
  CreateRecurringExpenseDto,
  FinancialPeriodQueryDto,
  ListExpensesQueryDto,
  UpdateCategoryDto,
  UpdateExpenseDto,
  UpdateRecurringExpenseDto,
} from './dto/financial.dto';

function metadata(request: Request) {
  const forwarded = request.headers['x-forwarded-for'];
  const ipAddress = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : request.ip;
  return { ...(ipAddress ? { ipAddress } : {}), requestId: requestIdOf(request) };
}

@ApiTags('financial')
@ApiBearerAuth()
@Controller('financial')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinancialController {
  constructor(private readonly service: FinancialService) {}

  @Get('dashboard')
  @Permissions('financial.read')
  @ApiOperation({ summary: 'Dashboard financiero de ingresos, gastos y utilidad' })
  dashboard(@Query() query: FinancialPeriodQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.dashboard(query, user);
  }

  @Get('profitability')
  @Permissions('financial.read')
  profitability(@Query() query: FinancialPeriodQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.profitability(user, query);
  }

  @Get('categories')
  @Permissions('financial.read')
  categories(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listCategories(user);
  }

  @Post('categories')
  @Permissions('financial.manage')
  categoriesCreate(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createCategory(dto, user, metadata(request));
  }

  @Patch('categories/:id')
  @Permissions('financial.manage')
  categoriesUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.updateCategory(id, dto, user, metadata(request));
  }

  @Post('categories/:id/archive')
  @Permissions('financial.manage')
  categoriesArchive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.archiveCategory(id, user, metadata(request));
  }

  @Get('expenses')
  @Permissions('financial.read')
  expenses(@Query() query: ListExpensesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listExpenses(query, user);
  }

  @Post('expenses')
  @Permissions('financial.manage')
  expensesCreate(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createExpense(dto, user, metadata(request));
  }

  @Patch('expenses/:id')
  @Permissions('financial.manage')
  expensesUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.updateExpense(id, dto, user, metadata(request));
  }

  @Post('expenses/:id/archive')
  @Permissions('financial.manage')
  expensesArchive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.archiveExpense(id, user, metadata(request));
  }

  @Get('recurring')
  @Permissions('financial.read')
  recurring(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listRecurring(user);
  }

  @Post('recurring')
  @Permissions('financial.manage')
  recurringCreate(
    @Body() dto: CreateRecurringExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createRecurring(dto, user, metadata(request));
  }

  @Patch('recurring/:id')
  @Permissions('financial.manage')
  recurringUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.updateRecurring(id, dto, user, metadata(request));
  }

  @Post('recurring/generate')
  @Permissions('financial.manage')
  generate(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.generateDueRecurring(user, metadata(request));
  }
}
