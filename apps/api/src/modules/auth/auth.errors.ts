import { HttpException, HttpStatus } from '@nestjs/common';

export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  FORBIDDEN: 'AUTH_FORBIDDEN',
  INVALID_REFRESH_TOKEN: 'AUTH_INVALID_REFRESH_TOKEN',
  REFRESH_TOKEN_REUSE: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
  INVALID_RESET_TOKEN: 'AUTH_INVALID_RESET_TOKEN',
  PASSWORD_POLICY: 'AUTH_PASSWORD_POLICY',
  RATE_LIMITED: 'AUTH_RATE_LIMITED',
  INVALID_REQUEST: 'AUTH_INVALID_REQUEST',
} as const;

export function authException(status: HttpStatus, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, code, message }, status);
}
