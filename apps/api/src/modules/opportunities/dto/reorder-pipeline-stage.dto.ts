import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class ReorderPipelineStageDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(1000)
  order!: number;
}
