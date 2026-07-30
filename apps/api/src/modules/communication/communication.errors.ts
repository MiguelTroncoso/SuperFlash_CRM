import { HttpException, HttpStatus } from '@nestjs/common';

export const COMMUNICATION_ERROR_CODES = {
  PROVIDER_NOT_FOUND: 'COMMUNICATION_PROVIDER_NOT_FOUND',
  PROVIDER_DISABLED: 'COMMUNICATION_PROVIDER_DISABLED',
  WEBHOOK_INVALID: 'COMMUNICATION_WEBHOOK_INVALID',
} as const;

export type CommunicationErrorCode =
  (typeof COMMUNICATION_ERROR_CODES)[keyof typeof COMMUNICATION_ERROR_CODES];

export function communicationException(
  status: HttpStatus,
  code: CommunicationErrorCode,
  message: string,
): HttpException {
  return new HttpException({ statusCode: status, code, message }, status);
}
