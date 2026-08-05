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

import { requestIdOf } from '../../infrastructure/http/request-correlation';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  ChangeProspectStateDto,
  CommercialImportDto,
  CreateAttributionDto,
  CreateCampaignDto,
  CreateLossReasonDto,
  CreateProspectReasonDto,
  CreateSpendDto,
  CorrectAttributionDto,
  ListMarketingQueryDto,
  MarketingDateQueryDto,
  MarketingHierarchyDto,
  UpdateCampaignDto,
  UpdateEngagementConfigDto,
  UpdateLossReasonDto,
  UpdateSpendDto,
} from './dto/marketing.dto';
import { MarketingService } from './marketing.service';

function metadata(request: Request) {
  const forwarded = request.headers['x-forwarded-for'];
  const ipAddress = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : request.ip;
  return { ...(ipAddress ? { ipAddress } : {}), requestId: requestIdOf(request) };
}

@ApiTags('marketing')
@ApiBearerAuth()
@Controller('marketing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MarketingController {
  constructor(private readonly service: MarketingService) {}

  @Get('campaigns')
  @Permissions('marketing.campaigns.read')
  campaigns(@Query() query: ListMarketingQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listCampaigns(query, user);
  }

  @Post('campaigns')
  @Permissions('marketing.campaigns.manage')
  campaignsCreate(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createCampaign(dto, user, metadata(request));
  }

  @Patch('campaigns/:id')
  @Permissions('marketing.campaigns.manage')
  campaignsUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.updateCampaign(id, dto, user, metadata(request));
  }

  @Post('campaigns/:id/archive')
  @Permissions('marketing.campaigns.manage')
  campaignsArchive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.archiveCampaign(id, user, metadata(request));
  }

  @Get('ad-sets')
  @Permissions('marketing.campaigns.read')
  adSets(@Query() query: ListMarketingQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listHierarchy('adSets', query, user);
  }

  @Post('ad-sets')
  @Permissions('marketing.campaigns.manage')
  adSetsCreate(
    @Body() dto: MarketingHierarchyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createHierarchy('adSet', dto, user, metadata(request));
  }

  @Get('ads')
  @Permissions('marketing.campaigns.read')
  ads(@Query() query: ListMarketingQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listHierarchy('ads', query, user);
  }

  @Post('ads')
  @Permissions('marketing.campaigns.manage')
  adsCreate(
    @Body() dto: MarketingHierarchyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createHierarchy('ad', dto, user, metadata(request));
  }

  @Get('creatives')
  @Permissions('marketing.campaigns.read')
  creatives(@Query() query: ListMarketingQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listHierarchy('creatives', query, user);
  }

  @Post('creatives')
  @Permissions('marketing.campaigns.manage')
  creativesCreate(
    @Body() dto: MarketingHierarchyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createHierarchy('creative', dto, user, metadata(request));
  }

  @Get('spend')
  @Permissions('marketing.spend.read')
  spend(@Query() query: MarketingDateQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listSpend(query, user);
  }

  @Post('spend')
  @Permissions('marketing.spend.manage')
  spendCreate(
    @Body() dto: CreateSpendDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createSpend(dto, user, metadata(request));
  }

  @Patch('spend/:id')
  @Permissions('marketing.spend.manage')
  spendUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSpendDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.updateSpend(id, dto, user, metadata(request));
  }

  @Post('spend/:id/archive')
  @Permissions('marketing.spend.manage')
  spendArchive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.archiveSpend(id, user, metadata(request));
  }

  @Get('performance')
  @Permissions('marketing.analytics.read')
  performance(@Query() query: MarketingDateQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.performance(query, user);
  }

  @Get('attribution')
  @Permissions('marketing.attribution.read')
  attribution(@Query() query: MarketingDateQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listAttributions(query, user);
  }

  @Post('attribution')
  @Permissions('marketing.attribution.manage')
  attributionCreate(
    @Body() dto: CreateAttributionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createAttribution(dto, user, metadata(request));
  }

  @Patch('attribution/:id')
  @Permissions('marketing.attribution.manage')
  attributionCorrect(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrectAttributionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.correctAttribution(id, dto, user, metadata(request));
  }

  @Get('loss-reasons')
  @Permissions('marketing.loss-reasons.read')
  lossReasons(
    @Query('type') type: CreateLossReasonDto['type'] | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listLossReasons(type, user);
  }

  @Post('loss-reasons')
  @Permissions('marketing.loss-reasons.manage')
  lossReasonsCreate(
    @Body() dto: CreateLossReasonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createLossReason(dto, user, metadata(request));
  }

  @Patch('loss-reasons/:id')
  @Permissions('marketing.loss-reasons.manage')
  lossReasonsUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLossReasonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.updateLossReason(id, dto, user, metadata(request));
  }

  @Post('reasons')
  @Permissions('marketing.loss-reasons.manage')
  reasonsCreate(
    @Body() dto: CreateProspectReasonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createProspectReason(dto, user, metadata(request));
  }

  @Get('prospect-states/:contactId')
  @Permissions('marketing.analytics.read')
  prospectState(
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getProspectState(contactId, user);
  }

  @Post('prospect-states/:contactId')
  @Permissions('marketing.campaigns.manage')
  prospectStateChange(
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: ChangeProspectStateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.changeProspectState(contactId, dto, user, metadata(request));
  }

  @Get('settings/engagement')
  @Permissions('settings.manage')
  engagementSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getEngagementConfig(user);
  }

  @Patch('settings/engagement')
  @Permissions('settings.manage')
  engagementSettingsUpdate(
    @Body() dto: UpdateEngagementConfigDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.updateEngagementConfig(dto, user, metadata(request));
  }

  @Post('imports/preview')
  @Permissions('imports.commercial.execute')
  importPreview(@Body() dto: CommercialImportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.previewImport(dto, user);
  }

  @Post('imports')
  @Permissions('imports.commercial.execute')
  importExecute(
    @Body() dto: CommercialImportDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.executeImport(dto, user, metadata(request));
  }

  @Get('imports')
  @Permissions('imports.commercial.read')
  imports(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listImports(user);
  }
}
