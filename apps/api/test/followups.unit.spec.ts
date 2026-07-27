import { FollowUpPriority, FollowUpStatus } from '@prisma/client';

import { FollowUpAccessPolicy } from '../src/modules/follow-ups/access/followup-access.policy';
import {
  isFollowUpOverdue,
  normalizeFollowUpNote,
  normalizeFollowUpTitle,
} from '../src/modules/follow-ups/followups.types';

function user(roleName: string, permissions: string[], userId = 'user-a') {
  return {
    userId,
    organizationId: 'org-a',
    sessionId: 'session-a',
    roleId: 'role-a',
    roleName,
    permissions,
  };
}

describe('follow-up domain rules', () => {
  it('normalizes titles and notes without changing business meaning', () => {
    expect(normalizeFollowUpTitle('  Contactar   cliente  ')).toBe('Contactar cliente');
    expect(normalizeFollowUpNote('  nota  ')).toBe('nota');
    expect(normalizeFollowUpNote('   ')).toBeNull();
  });

  it('calculates overdue only for pending follow-ups', () => {
    const now = new Date('2026-08-01T12:00:00.000Z');
    expect(
      isFollowUpOverdue(FollowUpStatus.PENDING, new Date('2026-08-01T11:59:00.000Z'), now),
    ).toBe(true);
    expect(
      isFollowUpOverdue(FollowUpStatus.COMPLETED, new Date('2026-08-01T11:59:00.000Z'), now),
    ).toBe(false);
    expect(isFollowUpOverdue(FollowUpStatus.PENDING, now, now)).toBe(false);
  });

  it('applies Sales policy to reading and mutation', () => {
    const policy = new FollowUpAccessPolicy();
    const sales = user('Sales', ['followups.read', 'followups.update']);
    expect(policy.canRead(sales)).toBe(true);
    expect(policy.canMutate(sales, { userId: 'user-a', opportunityUserId: 'user-a' })).toBe(true);
    expect(policy.canMutate(sales, { userId: 'user-b', opportunityUserId: 'user-a' })).toBe(false);
    expect(policy.canMutate(sales, { userId: 'user-a', opportunityUserId: 'user-b' })).toBe(false);
  });

  it('permits Sales to work unassigned opportunities but not other owners', () => {
    const policy = new FollowUpAccessPolicy();
    const sales = user('Sales', ['followups.create', 'followups.update']);
    expect(policy.canCreateForOpportunity(sales, null)).toBe(true);
    expect(policy.canCreateForOpportunity(sales, 'user-a')).toBe(true);
    expect(policy.canCreateForOpportunity(sales, 'user-b')).toBe(false);
    expect(policy.canAssign(sales, { userId: 'user-a', opportunityUserId: null }, 'user-a')).toBe(
      true,
    );
  });

  it('keeps priority values explicit and ordered', () => {
    expect(Object.values(FollowUpPriority)).toEqual(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
  });
});
