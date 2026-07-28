import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';

export interface OperationsRequestContext {
  user: AuthenticatedUser;
  metadata: RequestMetadata;
}

export function safeObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

export function publicId(value: string | null | undefined): string | null {
  return value ?? null;
}

const SECRET_KEY_PATTERN =
  /(password|secret|token|apikey|api_key|privatekey|private_key|credential)/i;

export function assertNoSecrets(value: unknown, path = 'metadata'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            code: 'OPERATIONS_INVALID_METADATA',
            message: `No se permiten secretos en ${path}.${key}.`,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      assertNoSecrets(nested, `${path}.${key}`);
    }
  }
}

export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
