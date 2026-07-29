import {
  IsEnum,
  IsArray,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WhatsAppConversationStatus } from '@prisma/client';

export class UpsertWhatsAppConnectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  wabaId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  phoneNumberId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  businessPhoneNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  appSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  webhookVerifyToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  graphApiVersion?: string;
}

export class ListWhatsAppConversationsQueryDto {
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
  @IsEnum(WhatsAppConversationStatus)
  status?: WhatsAppConversationStatus;
}

export class ListWhatsAppMessagesQueryDto {
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
  limit = 50;
}

export enum WhatsAppOutboundType {
  TEXT = 'TEXT',
  TEMPLATE = 'TEMPLATE',
}

export class SendWhatsAppMessageDto {
  @IsEnum(WhatsAppOutboundType)
  type!: WhatsAppOutboundType;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  templateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  templateLanguage?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  templateComponents?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class AssignWhatsAppConversationDto {
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;
}

export class WhatsAppTemplateQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class WhatsAppWebhookVerificationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  mode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  verifyToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  challenge?: string;
}

export class WhatsAppHealthcheckDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  callbackUrl?: string;

  @IsOptional()
  @IsISO8601()
  checkedAt?: string;
}
