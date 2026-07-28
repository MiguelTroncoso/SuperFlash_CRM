import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsObject, IsPositive } from 'class-validator';

import { AutomationActionType } from '@prisma/client';

export class AutomationActionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @IsPositive()
  actionOrder!: number;

  @ApiProperty({ enum: AutomationActionType })
  @IsEnum(AutomationActionType)
  type!: AutomationActionType;

  @ApiProperty({ type: Object })
  @IsObject()
  config!: Record<string, unknown>;
}
