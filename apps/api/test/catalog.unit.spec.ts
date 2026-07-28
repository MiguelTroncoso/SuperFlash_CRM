import { HttpException } from '@nestjs/common';
import { CustomerSegment, Prisma } from '@prisma/client';

import { CatalogAccessPolicy } from '../src/modules/catalog/access/catalog-access.policy';
import {
  isJsonObject,
  isValidDateRange,
  normalizeCode,
  normalizeCurrency,
  normalizeIsoCountry,
  normalizeName,
  normalizeSlug,
  toSafeJson,
} from '../src/modules/catalog/catalog.types';
import { AuthenticatedUser } from '../src/modules/auth/auth.types';
import {
  comparePricingCandidates,
  PricingCandidate,
} from '../src/modules/catalog/pricing/pricing.service';

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
  const candidate = (
    id: string,
    segment: CustomerSegment,
    countryCode: string | null,
    isDefault: boolean,
    priority: number,
    createdAt: string,
  ): PricingCandidate => ({
    id,
    createdAt: new Date(createdAt),
    priceBook: { customerSegment: segment, countryCode, isDefault, priority },
  });

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

  it('ranks an exact segment before ANY even with extreme priority', () => {
    const exact = candidate(
      '00000000-0000-0000-0000-000000000001',
      CustomerSegment.END_CUSTOMER,
      null,
      false,
      -10000,
      '2026-01-01T00:00:00.000Z',
    );
    const any = candidate(
      '00000000-0000-0000-0000-000000000002',
      CustomerSegment.ANY,
      null,
      true,
      10000,
      '2026-12-01T00:00:00.000Z',
    );
    expect(comparePricingCandidates(exact, any, CustomerSegment.END_CUSTOMER, null)).toBeLessThan(
      0,
    );
  });

  it('ranks an exact country before a global price book', () => {
    const exact = candidate(
      '00000000-0000-0000-0000-000000000001',
      CustomerSegment.ANY,
      'CL',
      false,
      -10000,
      '2026-01-01T00:00:00.000Z',
    );
    const global = candidate(
      '00000000-0000-0000-0000-000000000002',
      CustomerSegment.ANY,
      null,
      true,
      10000,
      '2026-12-01T00:00:00.000Z',
    );
    expect(comparePricingCandidates(exact, global, CustomerSegment.ANY, 'CL')).toBeLessThan(0);
  });

  it('ranks default before priority, then priority descending', () => {
    const defaultBook = candidate(
      '00000000-0000-0000-0000-000000000001',
      CustomerSegment.ANY,
      null,
      true,
      -10000,
      '2026-01-01T00:00:00.000Z',
    );
    const prioritized = candidate(
      '00000000-0000-0000-0000-000000000002',
      CustomerSegment.ANY,
      null,
      false,
      10000,
      '2026-12-01T00:00:00.000Z',
    );
    expect(
      comparePricingCandidates(defaultBook, prioritized, CustomerSegment.ANY, null),
    ).toBeLessThan(0);

    const highPriority = {
      ...prioritized,
      priceBook: { ...prioritized.priceBook, isDefault: true, priority: 100 },
    };
    const lowPriority = {
      ...defaultBook,
      priceBook: { ...defaultBook.priceBook, isDefault: true, priority: -100 },
    };
    expect(
      comparePricingCandidates(highPriority, lowPriority, CustomerSegment.ANY, null),
    ).toBeLessThan(0);
  });

  it('uses createdAt and id as stable final tie breakers', () => {
    const older = candidate(
      '00000000-0000-0000-0000-000000000001',
      CustomerSegment.ANY,
      null,
      false,
      0,
      '2026-01-01T00:00:00.000Z',
    );
    const newer = candidate(
      '00000000-0000-0000-0000-000000000002',
      CustomerSegment.ANY,
      null,
      false,
      0,
      '2026-02-01T00:00:00.000Z',
    );
    expect(comparePricingCandidates(newer, older, CustomerSegment.ANY, null)).toBeLessThan(0);

    const idA = { ...older, createdAt: newer.createdAt };
    const idB = { ...newer, createdAt: newer.createdAt };
    expect(comparePricingCandidates(idA, idB, CustomerSegment.ANY, null)).toBeLessThan(0);
  });

  it('normalizes country and currency and serializes Decimal values', () => {
    expect(normalizeIsoCountry(' cl ')).toBe('CL');
    expect(normalizeCurrency(' usd ')).toBe('USD');
    expect(new Prisma.Decimal('12.50').toFixed(2)).toBe('12.50');
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
