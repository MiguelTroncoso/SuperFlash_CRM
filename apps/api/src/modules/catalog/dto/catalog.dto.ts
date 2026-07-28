import {
  BillingPeriodUnit,
  CustomerSegment,
  FulfillmentMode,
  PriceBookStatus,
  ProductStatus,
  ProductType,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsISO4217CurrencyCode,
  IsOptional,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateCategoryDto {
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 120)
  slug?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCategoryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 120)
  slug?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ReorderDto {
  @IsInt()
  @Min(1)
  @Max(10000)
  order!: number;
}

export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  name!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 120)
  slug?: string;

  @Transform(upper)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/)
  sku?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsEnum(ProductType)
  type!: ProductType;

  @IsEnum(FulfillmentMode)
  fulfillmentMode!: FulfillmentMode;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresSubscription?: boolean;

  @IsOptional()
  @IsBoolean()
  allowsDemo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  demoDurationHours?: number;

  @IsOptional()
  @IsBoolean()
  requiresCustomerEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresCustomerPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresManualReview?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateProductDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 120)
  slug?: string;

  @Transform(upper)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/)
  sku?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @IsOptional()
  @IsEnum(FulfillmentMode)
  fulfillmentMode?: FulfillmentMode;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresSubscription?: boolean;

  @IsOptional()
  @IsBoolean()
  allowsDemo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  demoDurationHours?: number;

  @IsOptional()
  @IsBoolean()
  requiresCustomerEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresCustomerPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresManualReview?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ProductListQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 160)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @IsOptional()
  @IsEnum(FulfillmentMode)
  fulfillmentMode?: FulfillmentMode;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsEnum(CustomerSegment)
  customerSegment?: CustomerSegment;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  allowsDemo?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  requiresSubscription?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  archived?: boolean;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'name', 'slug'])
  sortBy: 'createdAt' | 'updatedAt' | 'name' | 'slug' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class CreatePlanDto {
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name!: string;

  @Transform(upper)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/)
  code?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsEnum(CustomerSegment)
  customerSegment!: CustomerSegment;

  @IsEnum(BillingPeriodUnit)
  billingPeriodUnit!: BillingPeriodUnit;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  billingPeriodCount?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  deviceLimit?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,3})?$/)
  creditAmount?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdatePlanDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @Transform(upper)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/)
  code?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsOptional()
  @IsEnum(CustomerSegment)
  customerSegment?: CustomerSegment;

  @IsOptional()
  @IsEnum(BillingPeriodUnit)
  billingPeriodUnit?: BillingPeriodUnit;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  billingPeriodCount?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  deviceLimit?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,3})?$/)
  creditAmount?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateVariantDto {
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name!: string;

  @Transform(upper)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/)
  code?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsObject()
  attributes!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}

export class UpdateVariantDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @Transform(upper)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  code?: string;

  @IsOptional()
  @IsUUID()
  planId?: string | null;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}

export class CreatePriceBookDto {
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsEnum(PriceBookStatus)
  status!: PriceBookStatus;

  @IsEnum(CustomerSegment)
  customerSegment!: CustomerSegment;

  @Transform(upper)
  @IsOptional()
  @IsISO31661Alpha2()
  countryCode?: string;

  @Transform(upper)
  @IsISO4217CurrencyCode()
  currency!: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  @Min(-10000)
  @Max(10000)
  priority?: number;
}

export class UpdatePriceBookDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsOptional()
  @IsEnum(PriceBookStatus)
  status?: PriceBookStatus;

  @IsOptional()
  @IsEnum(CustomerSegment)
  customerSegment?: CustomerSegment;

  @Transform(upper)
  @IsOptional()
  @IsISO31661Alpha2()
  countryCode?: string | null;

  @Transform(upper)
  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  @Min(-10000)
  @Max(10000)
  priority?: number;
}

export class PriceBookListQueryDto {
  @IsOptional()
  @IsEnum(PriceBookStatus)
  status?: PriceBookStatus;

  @IsOptional()
  @IsEnum(CustomerSegment)
  customerSegment?: CustomerSegment;

  @Transform(upper)
  @IsOptional()
  @IsISO31661Alpha2()
  countryCode?: string;

  @Transform(upper)
  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;
}

export class CreatePriceEntryDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  salePrice!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  costPrice?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  minimumPrice?: string;

  @IsOptional()
  @IsBoolean()
  taxIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

export class UpdatePriceEntryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  salePrice?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  costPrice?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  minimumPrice?: string;

  @IsOptional()
  @IsBoolean()
  taxIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

export class PriceEntryListQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  includeCosts?: boolean;
}

export class PricingResolveQueryDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsEnum(CustomerSegment)
  customerSegment!: CustomerSegment;

  @Transform(upper)
  @IsOptional()
  @IsISO31661Alpha2()
  countryCode?: string;

  @Transform(upper)
  @IsISO4217CurrencyCode()
  currency!: string;

  @IsOptional()
  @IsDateString()
  at?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  includeCosts?: boolean;
}

export class OffersQueryDto {
  @IsEnum(CustomerSegment)
  customerSegment!: CustomerSegment;

  @Transform(upper)
  @IsOptional()
  @IsISO31661Alpha2()
  countryCode?: string;

  @Transform(upper)
  @IsISO4217CurrencyCode()
  currency!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 160)
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  includeCosts?: boolean;
}
