import { RenewalStatus, RenewalWorkflowStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RenewalCenterQueryDto {
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
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsEnum(RenewalStatus)
  status?: RenewalStatus;

  @IsOptional()
  @IsEnum(RenewalWorkflowStatus)
  workflowStatus?: RenewalWorkflowStatus;

  @IsOptional()
  @IsIn(['dueAt', 'periodEnd', 'amount', 'createdAt', 'updatedAt'])
  sortBy: 'dueAt' | 'periodEnd' | 'amount' | 'createdAt' | 'updatedAt' = 'dueAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}

export class RenewalDashboardQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class UpdateRenewalWorkflowDto {
  @IsEnum(RenewalWorkflowStatus)
  workflowStatus!: RenewalWorkflowStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RenewalReportQueryDto extends RenewalCenterQueryDto {
  @IsOptional()
  @IsIn(['month', 'quarter', 'year', 'product', 'country', 'seller', 'customer'])
  groupBy: 'month' | 'quarter' | 'year' | 'product' | 'country' | 'seller' | 'customer' = 'month';
}

export class RenewalImportDto {
  @IsString()
  @MaxLength(2_000_000)
  csv!: string;
}
