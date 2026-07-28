import { Prisma } from '@prisma/client';

import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';

export interface CommercialRequestContext {
  user: AuthenticatedUser;
  metadata: RequestMetadata;
}

export type CommercialClient = Prisma.TransactionClient;

export function decimalString(value: Prisma.Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toFixed(2);
}

export function jsonObject(
  value: Record<string, string | number | boolean | null>,
): Prisma.InputJsonObject {
  return value;
}

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function parseMoney(value: string | number | undefined, fallback = '0'): Prisma.Decimal {
  const source = value === undefined ? fallback : String(value);
  return new Prisma.Decimal(source);
}

export function parseQuantity(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(String(value));
}

export function nonNegative(value: Prisma.Decimal, field: string): void {
  if (value.isNegative()) throw new Error(`${field} must be non-negative`);
}

export function positive(value: Prisma.Decimal, field: string): void {
  if (!value.gt(0)) throw new Error(`${field} must be greater than zero`);
}
