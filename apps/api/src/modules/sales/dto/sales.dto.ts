import { PaymentMethod, SaleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDecimal,
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
  ValidateNested,
} from 'class-validator';

export class ConfirmSalePaymentDto {
  @IsDecimal({ decimal_digits: '0,2' })
  amount!: string;

  @IsString()
  @MaxLength(3)
  currency!: string;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;
}

export class ConfirmSaleDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmSalePaymentDto)
  payment?: ConfirmSalePaymentDto;
}

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

  @IsOptional()
  @IsInt()
  @IsIn([30, 90, 180, 365])
  @ApiPropertyOptional({ enum: [30, 90, 180, 365], description: 'Duración de una suscripción.' })
  subscriptionDurationDays?: number;
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

  @IsOptional()
  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  paymentDueAt?: string;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsBoolean()
  paidNow?: boolean;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  paymentAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @IsArray()
  @ApiProperty({ type: [CreateSaleItemDto], minItems: 1 })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}

export class UpdateSaleDto {
  @IsOptional()
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @ApiPropertyOptional({ format: 'uuid', description: 'Ítem cuyo precio o duración se modifica.' })
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: '15000.00' })
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
  @ApiPropertyOptional({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  note?: string;

  @IsOptional()
  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  soldAt?: string | null;

  @IsOptional()
  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  paymentDueAt?: string | null;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod | null;

  @IsOptional()
  @IsBoolean()
  paidNow?: boolean;

  @IsOptional()
  @IsInt()
  @IsIn([30, 90, 180, 365])
  subscriptionDurationDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  priceOverrideReason?: string;
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
