import { ProviderFulfillmentMode, ProviderStatus, ProviderType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProviderDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsEnum(ProviderType)
  type!: ProviderType;

  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;

  @IsOptional()
  @IsEnum(ProviderFulfillmentMode)
  fulfillmentMode?: ProviderFulfillmentMode;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  apiBaseUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class UpdateProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @IsEnum(ProviderType)
  type?: ProviderType;

  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;

  @IsOptional()
  @IsEnum(ProviderFulfillmentMode)
  fulfillmentMode?: ProviderFulfillmentMode;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  apiBaseUrl?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}

export class ListProvidersQueryDto {
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
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  archived = false;
}

export class CreateProviderMappingDto {
  @IsUUID()
  providerId!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalProductId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalPlanId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalVariantId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  priority = 0;

  @IsOptional()
  @IsBoolean()
  active = true;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateProviderMappingDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalProductId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalPlanId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalVariantId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ListProviderMappingsQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}

export class ProviderStatusDto {
  @IsEnum(ProviderStatus)
  status!: ProviderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsISO8601()
  changedAt?: string;
}
