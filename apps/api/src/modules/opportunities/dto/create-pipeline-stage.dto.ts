import { ApiProperty } from '@nestjs/swagger';
import { PipelineStageCategory } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
const HEX_COLOR = /^#[0-9A-F]{6}$/i;

export class CreatePipelineStageDto {
  @ApiProperty({ example: 'Nuevo lead' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(trim)
  name!: string;

  @ApiProperty({ example: '#2563EB' })
  @IsString()
  @Matches(HEX_COLOR)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  color!: string;

  @ApiProperty({ enum: PipelineStageCategory })
  @IsEnum(PipelineStageCategory)
  category!: PipelineStageCategory;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(1000)
  order!: number;

  @ApiProperty({ required: false, description: 'Clave estable para estados operativos.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  systemKey?: string;
}
