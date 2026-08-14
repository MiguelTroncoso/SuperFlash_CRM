import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class MoveOpportunityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  pipelineStageId!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  reason?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Seguimiento manual requerido por el estado.',
  })
  @IsOptional()
  @IsISO8601()
  nextFollowUpAt?: string | null;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Fecha estimada de compra para Quiere comprar.',
  })
  @IsOptional()
  @IsISO8601()
  estimatedPurchaseAt?: string | null;
}
