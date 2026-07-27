import { ApiPropertyOptional } from '@nestjs/swagger';
import { PipelineStageCategory } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum OpportunitySortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  LAST_STAGE_CHANGED_AT = 'lastStageChangedAt',
  EXPECTED_AMOUNT = 'expectedAmount',
  TITLE = 'title',
  CLOSED_AT = 'closedAt',
}

export enum OpportunitySortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

export class ListOpportunitiesQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  pipelineStageId?: string;

  @ApiPropertyOptional({ enum: PipelineStageCategory })
  @IsOptional()
  @IsEnum(PipelineStageCategory)
  stageCategory?: PipelineStageCategory;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ example: 'CL' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  @Transform(upper)
  country?: string;

  @ApiPropertyOptional({ example: 'CLP' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  @Transform(upper)
  currency?: string;

  @ApiPropertyOptional({ description: 'Incluye archivadas cuando es true.' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  closedFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  closedTo?: string;

  @ApiPropertyOptional({ enum: OpportunitySortBy, default: OpportunitySortBy.CREATED_AT })
  @IsOptional()
  @IsEnum(OpportunitySortBy)
  sortBy: OpportunitySortBy = OpportunitySortBy.CREATED_AT;

  @ApiPropertyOptional({ enum: OpportunitySortOrder, default: OpportunitySortOrder.DESC })
  @IsOptional()
  @IsEnum(OpportunitySortOrder)
  sortOrder: OpportunitySortOrder = OpportunitySortOrder.DESC;
}
