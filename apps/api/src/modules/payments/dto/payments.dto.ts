import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
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
} from 'class-validator';

export class CreatePaymentDto {
  @IsOptional()
  @ApiPropertyOptional({ example: '50.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  amount?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: '50.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  grossAmount?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: '1.50' })
  @IsDecimal({ decimal_digits: '0,2' })
  feeAmount?: string;

  @IsString()
  @ApiPropertyOptional({ default: 'USD', example: 'USD', maxLength: 3 })
  @MaxLength(3)
  currency = 'USD';

  @IsEnum(PaymentMethod)
  @ApiProperty({ enum: PaymentMethod })
  method!: PaymentMethod;

  @IsOptional()
  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  reference?: string;

  @IsOptional()
  @ApiPropertyOptional({ maxLength: 128 })
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RefundPaymentDto {
  @ApiProperty({ example: '25.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  amount!: string;

  @IsOptional()
  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListPaymentsQueryDto {
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
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsUUID()
  saleId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'paymentDate', 'netAmount'])
  sortBy: 'createdAt' | 'updatedAt' | 'paymentDate' | 'netAmount' = 'createdAt';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
