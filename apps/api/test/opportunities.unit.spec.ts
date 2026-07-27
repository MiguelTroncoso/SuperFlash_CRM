import { HttpException } from '@nestjs/common';
import { PipelineStageCategory } from '@prisma/client';

import { OpportunityAccessPolicy } from '../src/modules/opportunities/access/opportunity-access.policy';
import {
  decodeCursor,
  encodeCursor,
  isValidExpectedAmount,
  normalizeCurrency,
  normalizeTitle,
  opportunityStatus,
} from '../src/modules/opportunities/opportunities.types';
import { AuthenticatedUser } from '../src/modules/auth/auth.types';

function user(
  roleName: string,
  permissions: readonly string[] = ['opportunities.read', 'opportunities.update'],
): AuthenticatedUser {
  return {
    userId: '00000000-0000-0000-0000-000000000001',
    organizationId: '00000000-0000-0000-0000-000000000010',
    sessionId: '00000000-0000-0000-0000-000000000011',
    roleId: '00000000-0000-0000-0000-000000000012',
    roleName,
    permissions,
  };
}

describe('opportunities domain primitives', () => {
  it('normalizes titles and currencies without changing domain meaning', () => {
    expect(normalizeTitle('  Interés   de Juan  ')).toBe('Interés de Juan');
    expect(normalizeCurrency(' clp ')).toBe('CLP');
    expect(normalizeCurrency('')).toBeNull();
  });

  it('validates monetary precision and bounds at the string boundary', () => {
    expect(isValidExpectedAmount('100000.00')).toBe(true);
    expect(isValidExpectedAmount('100000.001')).toBe(false);
    expect(isValidExpectedAmount('01')).toBe(false);
    expect(isValidExpectedAmount('999999999999.99')).toBe(true);
  });

  it('derives status from archive and stage category', () => {
    expect(opportunityStatus(null, PipelineStageCategory.OPEN)).toBe('OPEN');
    expect(opportunityStatus(null, PipelineStageCategory.WON)).toBe('WON');
    expect(opportunityStatus(null, PipelineStageCategory.LOST)).toBe('LOST');
    expect(opportunityStatus(new Date(), PipelineStageCategory.WON)).toBe('ARCHIVED');
  });

  it('round-trips cursor pagination deterministically', () => {
    const createdAt = new Date('2026-07-30T12:00:00.000Z');
    const cursor = encodeCursor(createdAt, '00000000-0000-0000-0000-000000000001');
    expect(decodeCursor(cursor)).toEqual({ createdAt, id: '00000000-0000-0000-0000-000000000001' });
    expect(decodeCursor('not-a-cursor')).toBeNull();
  });

  it('enforces Sales ownership and rejects missing mutation permissions', () => {
    const policy = new OpportunityAccessPolicy();
    const seller = user('Sales');
    expect(policy.canMutate(seller, { userId: null })).toBe(true);
    expect(policy.canMutate(seller, { userId: seller.userId })).toBe(true);
    expect(policy.canMutate(seller, { userId: '00000000-0000-0000-0000-000000000099' })).toBe(
      false,
    );
    expect(
      policy.canMutate(user('Owner'), { userId: '00000000-0000-0000-0000-000000000099' }),
    ).toBe(true);
    expect(() =>
      policy.assertCanMutate(user('Viewer', ['opportunities.read']), { userId: null }),
    ).toThrow(HttpException);
  });
});
