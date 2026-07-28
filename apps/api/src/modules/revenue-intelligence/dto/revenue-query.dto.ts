import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class RevenueQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  country?: string;

  @IsOptional()
  currency?: string;

  @IsOptional()
  stages?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  compare = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  horizon = 3;
}
