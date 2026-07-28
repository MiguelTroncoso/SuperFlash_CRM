import { Prisma } from '@prisma/client';

import { RequestMetadata } from '../auth/auth.types';

export interface CatalogRequestContext {
  user: import('../auth/auth.types').AuthenticatedUser;
  metadata: RequestMetadata;
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeSlug(value: string): string {
  return normalizeName(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeCode(value: string | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = normalizeName(value).toUpperCase();
  return normalized || null;
}

export function normalizeIsoCountry(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = normalizeName(value).toUpperCase();
  return normalized || null;
}

export function normalizeCurrency(value: string): string {
  return normalizeName(value).toUpperCase();
}

export function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretKey);
  if (!isJsonObject(value)) return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      /(password|passwd|secret|token|credential|api[_-]?key)/i.test(key) ||
      containsSecretKey(nested),
  );
}

export function toSafeJson(value: unknown): Prisma.InputJsonValue {
  if (!isJsonObject(value) || containsSecretKey(value)) {
    throw new Error('metadata must be a JSON object without secrets');
  }
  return value as Prisma.InputJsonObject;
}

export function decimalString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(2);
}

export function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function isValidDateRange(from: Date | null, until: Date | null): boolean {
  return from === null || until === null || until.getTime() > from.getTime();
}

export async function withAdvisoryLock<T>(
  prisma: {
    $transaction: <R>(
      callback: (transaction: Prisma.TransactionClient) => Promise<R>,
    ) => Promise<R>;
  },
  namespace: string,
  organizationId: string,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${namespace}),
        hashtext(${organizationId})
      )
    `;
    return callback(transaction);
  });
}
