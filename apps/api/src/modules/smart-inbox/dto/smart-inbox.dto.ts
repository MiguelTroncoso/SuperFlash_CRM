import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDecimal,
  IsEnum,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FollowUpPriority, FulfillmentExecutionMode } from '@prisma/client';

export enum SmartInboxView {
  INBOX = 'INBOX',
  UNASSIGNED = 'UNASSIGNED',
  MINE = 'MINE',
  PENDING = 'PENDING',
  RENEWALS = 'RENEWALS',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
  TRASH = 'TRASH',
}

export class ListSmartInboxQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsEnum(SmartInboxView)
  view: SmartInboxView = SmartInboxView.INBOX;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unread?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  pending?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  demo?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  sale?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  renewal?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  tagId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}

export class AddInboxNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  note!: string;
}

export class MoveInboxPipelineDto {
  @IsUUID()
  pipelineStageId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateInboxSaleItemDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsUUID()
  priceBookEntryId?: string;

  @IsDecimal({ decimal_digits: '0,3' })
  quantity = '1';

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  unitPrice?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  discountAmount?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  taxAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  priceOverrideReason?: string;
}

export class CreateInboxSaleDto {
  @IsString()
  @MaxLength(3)
  currency = 'USD';

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  discountAmount?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  taxAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInboxSaleItemDto)
  items!: CreateInboxSaleItemDto[];
}

export class ScheduleInboxFollowUpDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsISO8601()
  dueAt!: string;

  @IsEnum(FollowUpPriority)
  priority!: FollowUpPriority;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;
}

export class CreateInboxFulfillmentDto {
  @IsUUID()
  saleItemId!: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsEnum(FulfillmentExecutionMode)
  mode?: FulfillmentExecutionMode;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

export class CreateInboxTrialDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsInt()
  @Min(1)
  @Max(43_200)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
