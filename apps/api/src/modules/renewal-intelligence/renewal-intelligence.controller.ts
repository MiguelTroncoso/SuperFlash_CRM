import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { requestIdOf } from '../../infrastructure/http/request-correlation';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  RenewalCenterQueryDto,
  RenewalDashboardQueryDto,
  RenewalImportDto,
  RenewalReportQueryDto,
  UpdateRenewalWorkflowDto,
} from './dto/renewal-intelligence.dto';
import { RenewalIntelligenceService } from './renewal-intelligence.service';

@ApiTags('renewal-center')
@ApiBearerAuth()
@Controller('renewal-center')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RenewalIntelligenceController {
  constructor(private readonly service: RenewalIntelligenceService) {}

  @Get('dashboard')
  @Permissions('renewals.read')
  @ApiOperation({ summary: 'Dashboard operativo de renovaciones' })
  dashboard(@Query() query: RenewalDashboardQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.dashboard(query, user);
  }

  @Get('upcoming')
  @Permissions('renewals.read')
  upcoming(@Query() query: RenewalCenterQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(query, user);
  }

  @Get('today')
  @Permissions('renewals.read')
  today(@Query() query: RenewalCenterQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const date = new Date();
    query.from = date.toISOString().slice(0, 10);
    query.to = query.from;
    return this.service.list(query, user);
  }

  @Get('overdue')
  @Permissions('renewals.read')
  overdue(@Query() query: RenewalCenterQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const overdueQuery = new RenewalCenterQueryDto();
    Object.assign(overdueQuery, query, { to: new Date().toISOString() });
    delete overdueQuery.status;
    return this.service.list(overdueQuery, user);
  }

  @Get('calendar')
  @Permissions('renewals.read')
  calendar(@Query() query: RenewalCenterQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.calendar(query, user);
  }

  @Get('history')
  @Permissions('renewals.read')
  history(@Query() query: RenewalCenterQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const historyQuery = new RenewalCenterQueryDto();
    Object.assign(historyQuery, query, { sortBy: 'updatedAt', sortOrder: 'desc' });
    delete historyQuery.status;
    delete historyQuery.workflowStatus;
    return this.service.list(historyQuery, user);
  }

  @Get('control-center')
  @Permissions('renewals.read')
  controlCenter(@Query() query: RenewalDashboardQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.dashboard(query, user);
  }

  @Get('reminders')
  @Permissions('renewals.read')
  reminders(@CurrentUser() user: AuthenticatedUser) {
    return this.service.reminders(user);
  }

  @Post('reminders/generate')
  @Permissions('renewals.update')
  generateReminders(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.service.generateReminders(user, requestIdOf(request));
  }

  @Get('reports')
  @Permissions('renewals.read')
  reports(@Query() query: RenewalReportQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.report(query, user);
  }

  @Get('reports/export')
  @Permissions('renewals.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportReport(
    @Query() query: RenewalReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.service.exportCsv(query, user);
    response.setHeader('Content-Disposition', 'attachment; filename="renewal-report.csv"');
    response.send(csv);
  }

  @Post('import/preview')
  @Permissions('renewals.create')
  importPreview(@Body() dto: RenewalImportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.importPreview(dto, user);
  }

  @Post('import')
  @Permissions('renewals.create')
  importCsv(
    @Body() dto: RenewalImportDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.importCsv(dto, user, requestIdOf(request));
  }

  @Get('customers/:contactId')
  @Permissions('renewals.read')
  customer(
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.customer(contactId, user);
  }

  @Patch(':id/workflow-status')
  @Permissions('renewals.update')
  workflowStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRenewalWorkflowDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.updateWorkflow(id, dto, user, requestIdOf(request));
  }
}
