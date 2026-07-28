import { HttpException } from '@nestjs/common';
import { CustomerSegment } from '@prisma/client';

import { CatalogAccessPolicy } from '../src/modules/catalog/access/catalog-access.policy';
import {
  isJsonObject,
  isValidDateRange,
  normalizeCode,
  normalizeName,
  normalizeSlug,
  toSafeJson,
} from '../src/modules/catalog/catalog.types';
import { AuthenticatedUser } from '../src/modules/auth/auth.types';

function user(roleName: string, permissions: readonly string[]): AuthenticatedUser {
  return {
    userId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000010',
    sessionId: '00000000-0000-0000-0000-000000000011',
    roleId: '00000000-0000-0000-0000-000000000012',
    roleName,
    permissions,
  };
}

describe('catalog domain primitives', () => {
  it('normalizes names, slugs and business codes deterministically', () => {
    expect(normalizeName('  Canva   Pro  ')).toBe('Canva Pro');
    expect(normalizeSlug(' Diseño / Edición ')).toBe('diseno-edicion');
    expect(normalizeCode(' basic-01 ')).toBe('BASIC-01');
  });

  it('accepts only root JSON objects without secrets', () => {
    expect(isJsonObject({ color: 'blue' })).toBe(true);
    expect(isJsonObject(['blue'])).toBe(false);
    expect(() => toSafeJson({ apiToken: 'never' })).toThrow();
  });

  it('enforces valid money/catalog periods at the boundary', () => {
    expect(isValidDateRange(new Date('2026-01-01'), new Date('2026-02-01'))).toBe(true);
    expect(isValidDateRange(new Date('2026-02-01'), new Date('2026-01-01'))).toBe(false);
  });

  it('allows costs only through the explicit permission', () => {
    const policy = new CatalogAccessPolicy();
    expect(() =>
      policy.assertCostsRead(user('Sales', ['catalog.read', 'catalog.prices.read'])),
    ).toThrow(HttpException);
    expect(() => policy.assertCostsRead(user('Owner', ['catalog.costs.read']))).not.toThrow();
    expect(CustomerSegment.ANY).toBe('ANY');
  });
});
