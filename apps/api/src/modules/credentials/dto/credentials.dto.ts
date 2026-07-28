import { IsISO8601, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCredentialDto {
  @IsOptional()
  @IsUUID()
  fulfillmentId?: string;

  @IsOptional()
  @IsUUID()
  activationId?: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  token?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ListCredentialsQueryDto {
  @IsOptional()
  @IsUUID()
  fulfillmentId?: string;

  @IsOptional()
  @IsUUID()
  activationId?: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;
}
