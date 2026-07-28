import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsPositive, Max } from 'class-validator';

import { AutomationExecutionStatus, AutomationTrigger } from '@prisma/client';

export class ListAutomationsQueryDto {
  @IsOptional()
  @IsEnum(AutomationTrigger)
  trigger?: AutomationTrigger;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  limit = 25;
}

export class ListAutomationExecutionsQueryDto {
  @IsOptional()
  @IsEnum(AutomationExecutionStatus)
  status?: AutomationExecutionStatus;

  @IsOptional()
  @IsEnum(AutomationTrigger)
  trigger?: AutomationTrigger;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  page = 1;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100)
  @Type(() => Number)
  limit = 25;
}
