import {
  FulfillmentExecutionMode,
  FulfillmentStatus,
  ProvisioningAttemptStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFulfillmentDto {
  @IsUUID()
  saleItemId!: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsEnum(FulfillmentExecutionMode)
  mode?: FulfillmentExecutionMode;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

export class AssignFulfillmentDto {
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;
}

export class CompleteFulfillmentDto {
  @IsOptional()
  @IsObject()
  resultSnapshot?: Record<string, unknown>;
}

export class FailFulfillmentDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  errorCode?: string;

  @IsOptional()
  @IsBoolean()
  retryable?: boolean;
}

export class ListFulfillmentsQueryDto {
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
  @IsEnum(FulfillmentStatus)
  status?: FulfillmentStatus;

  @IsOptional()
  @IsUUID()
  saleId?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ProvisionFulfillmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

export class ListProvisioningAttemptsQueryDto {
  @IsOptional()
  @IsEnum(ProvisioningAttemptStatus)
  status?: ProvisioningAttemptStatus;

  @IsOptional()
  @IsUUID()
  fulfillmentId?: string;
}
