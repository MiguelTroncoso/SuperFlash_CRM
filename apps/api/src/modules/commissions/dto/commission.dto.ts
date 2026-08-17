import { PaymentMethod } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDecimal, IsEnum, IsOptional, Max, Min } from 'class-validator';

export class UpdateCommissionDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({ example: '4.95' })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Max(100)
  percentage!: string;

  @ApiPropertyOptional({ example: '0.49' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  fixedFee = '0';

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Max(100)
  internationalPercentage = '0';

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Max(100)
  conversionPercentage = '0';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active = true;
}
