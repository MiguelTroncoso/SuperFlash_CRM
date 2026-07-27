import { HttpException, HttpStatus } from '@nestjs/common';

export const CONTACT_ERROR_CODES = {
  NOT_FOUND: 'CONTACT_NOT_FOUND',
  PHONE_ALREADY_EXISTS: 'CONTACT_PHONE_ALREADY_EXISTS',
  PHONE_ARCHIVED: 'CONTACT_PHONE_ARCHIVED',
  INVALID_PHONE: 'CONTACT_INVALID_PHONE',
  INVALID_COUNTRY: 'CONTACT_INVALID_COUNTRY',
  MINIMUM_IDENTITY_REQUIRED: 'CONTACT_MINIMUM_IDENTITY_REQUIRED',
  UPDATE_FORBIDDEN: 'CONTACT_UPDATE_FORBIDDEN',
  RESTORE_CONFLICT: 'CONTACT_RESTORE_CONFLICT',
  ASSIGNEE_NOT_FOUND: 'CONTACT_ASSIGNEE_NOT_FOUND',
  CAMPAIGN_NOT_FOUND: 'CONTACT_CAMPAIGN_NOT_FOUND',
  PRODUCT_NOT_FOUND: 'CONTACT_PRODUCT_NOT_FOUND',
  INITIAL_STAGE_NOT_FOUND: 'PIPELINE_INITIAL_STAGE_NOT_FOUND',
  TAG_NOT_FOUND: 'TAG_NOT_FOUND',
  TAG_NAME_ALREADY_EXISTS: 'TAG_NAME_ALREADY_EXISTS',
  TAG_INVALID_COLOR: 'TAG_INVALID_COLOR',
  OPERATION_FAILED: 'CONTACT_OPERATION_FAILED',
} as const;

export interface ContactErrorDetails {
  existingContactId?: string;
  existingTagId?: string;
}

export function contactException(
  status: HttpStatus,
  code: string,
  message: string,
  details?: ContactErrorDetails,
): HttpException {
  return new HttpException(
    {
      statusCode: status,
      code,
      message,
      ...details,
    },
    status,
  );
}
