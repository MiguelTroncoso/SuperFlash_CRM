import { Transform, Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const money = /^\d{1,14}(?:\.\d{1,2})?$/;

export class OperationalDashboardQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  @Transform(upper)
  country?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;
}

export class ListDailyMetricsQueryDto extends OperationalDashboardQueryDto {
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
}

export class UpsertDailyMetricDto {
  @IsISO8601()
  metricDate!: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  campaignName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  platform?: string;

  @IsString()
  @MaxLength(6)
  @Matches(/^(?:[A-Z]{2}|GLOBAL)$/)
  @Transform(upper)
  country!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  conversations!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  demos!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  salesCount = 0;

  @IsString()
  @Matches(money)
  adSpend = '0';

  @IsOptional()
  @IsString()
  @Matches(money)
  grossRevenue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  @Matches(/^[A-Z]{3}$/)
  @Transform(upper)
  currency = 'USD';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateDailyMetricDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  conversations?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  demos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  salesCount?: number;

  @IsOptional()
  @IsString()
  @Matches(money)
  adSpend?: string;

  @IsOptional()
  @IsString()
  @Matches(money)
  grossRevenue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ImportDailyMetricsDto {
  @IsString()
  @MaxLength(1_000_000)
  csv!: string;
}
