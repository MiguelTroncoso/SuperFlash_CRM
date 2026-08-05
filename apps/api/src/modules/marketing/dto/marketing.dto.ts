import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import {
  AttributionKind,
  CommercialImportType,
  MarketingStatus,
  ProspectConversationStateType,
  ProspectReasonType,
} from '@prisma/client';

export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  platform!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  source!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalId?: string;

  @IsOptional()
  @IsEnum(MarketingStatus)
  status?: MarketingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  objective?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  targetedCountry?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class MarketingHierarchyDto {
  @IsUUID()
  campaignId!: string;

  @IsOptional()
  @IsUUID()
  adSetId?: string;

  @IsOptional()
  @IsUUID()
  adId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalId?: string;

  @IsOptional()
  @IsEnum(MarketingStatus)
  status?: MarketingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetedCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  destination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  format?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  assetReference?: string;
}

export class ListMarketingQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  page = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  adSetId?: string;

  @IsOptional()
  @IsUUID()
  adId?: string;

  @IsOptional()
  @IsEnum(MarketingStatus)
  status?: MarketingStatus;
}

export class CreateSpendDto {
  @IsDateString()
  date!: string;

  @IsUUID()
  campaignId!: string;

  @IsOptional()
  @IsUUID()
  adSetId?: string;

  @IsOptional()
  @IsUUID()
  adId?: string;

  @IsOptional()
  @IsUUID()
  creativeId?: string;

  @IsNumberString()
  @MaxLength(18)
  amount!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  conversations?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  contacts?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  impressions?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reach?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  clicks?: number;

  @IsOptional()
  @IsNumberString()
  cpmInput?: string;

  @IsOptional()
  @IsNumberString()
  cpcInput?: string;

  @IsOptional()
  @IsNumberString()
  ctrInput?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}

export class UpdateSpendDto extends PartialType(CreateSpendDto) {}

export class MarketingDateQueryDto extends ListMarketingQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  actualCountry?: string;

  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  compare = false;
}

export class CreateAttributionDto {
  @IsEnum(AttributionKind)
  kind!: AttributionKind;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsUUID()
  trialId?: string;

  @IsOptional()
  @IsUUID()
  saleId?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  adSetId?: string;

  @IsOptional()
  @IsUUID()
  adId?: string;

  @IsOptional()
  @IsUUID()
  creativeId?: string;

  @IsString()
  @MaxLength(60)
  platform!: string;

  @IsString()
  @MaxLength(120)
  source!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  targetedCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  actualCountry?: string;

  @IsOptional()
  @IsDateString()
  acquiredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  correctionReason?: string;
}

export class CorrectAttributionDto extends PartialType(CreateAttributionDto) {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  override correctionReason!: string;
}

export class UpdateEngagementConfigDto {
  @IsInt()
  @Min(1)
  @Max(1440)
  slaFirstResponseThresholdMinutes!: number;

  @IsString()
  cadenceDays!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  maxUnansweredAttempts!: number;
}

export class ChangeProspectStateDto {
  @IsEnum(ProspectConversationStateType)
  state!: ProspectConversationStateType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateLossReasonDto {
  @IsEnum(ProspectReasonType)
  type!: ProspectReasonType;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  systemKey!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateLossReasonDto extends PartialType(CreateLossReasonDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateProspectReasonDto {
  @IsUUID()
  reasonId!: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CommercialImportDto {
  @IsEnum(CommercialImportType)
  type!: CommercialImportType;

  @IsString()
  @MinLength(1)
  @MaxLength(2_000_000)
  csv!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  fileName?: string;
}
