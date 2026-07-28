import { SaleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDecimal,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSaleItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @IsOptional()
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  planId?: string;

  @IsOptional()
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  priceBookEntryId?: string;

  @IsDecimal({ decimal_digits: '0,3' })
  @ApiPropertyOptional({ default: '1', example: '1' })
  quantity = '1';

  @IsOptional()
  @ApiPropertyOptional({ example: '49.90' })
  @IsDecimal({ decimal_digits: '0,2' })
  unitPrice?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: '0.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  discountAmount?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: '0.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  taxAmount?: string;

  @IsOptional()
  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  priceOverrideReason?: string;
}

export class CreateSaleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  contactId!: string;

  @IsOptional()
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  opportunityId?: string;

  @IsString()
  @ApiPropertyOptional({ default: 'USD', example: 'USD', maxLength: 3 })
  @MaxLength(3)
  currency = 'USD';

  @IsOptional()
  @ApiPropertyOptional({ example: '0.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  discountAmount?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: '0.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  taxAmount?: string;

  @IsOptional()
  @ApiPropertyOptional({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  note?: string;

  @IsArray()
  @ApiProperty({ type: [CreateSaleItemDto], minItems: 1 })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}

export class UpdateSaleDto {
  @IsOptional()
  @ApiPropertyOptional({ example: '0.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  discountAmount?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: '0.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  taxAmount?: string;

  @IsOptional()
  @ApiPropertyOptional({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  note?: string;
}

export class CancelSaleDto {
  @IsOptional()
  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListSalesQueryDto {
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
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'total', 'soldAt'])
  sortBy: 'createdAt' | 'updatedAt' | 'total' | 'soldAt' = 'createdAt';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
