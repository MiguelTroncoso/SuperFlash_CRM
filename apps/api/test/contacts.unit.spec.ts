import { HttpException } from '@nestjs/common';

import { ContactAccessPolicy } from '../src/modules/contacts/access/contact-access.policy';
import {
  buildInitialOpportunityTitle,
  hasMinimumIdentity,
  normalizeEmailValue,
  normalizeWhitespace,
} from '../src/modules/contacts/contacts.types';
import { PhoneNormalizerService } from '../src/modules/contacts/phone/phone-normalizer.service';
import { AuthenticatedUser } from '../src/modules/auth/auth.types';

function user(
  roleName: string,
  permissions: readonly string[] = ['contacts.read', 'contacts.update'],
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

describe('contacts domain primitives', () => {
  it('normalizes local Chilean numbers to E.164', () => {
    const result = new PhoneNormalizerService().normalize('9 1234 5678', 'CL');
    expect(result?.phoneNormalized).toBe('+56912345678');
    expect(result?.phone).toBe('9 1234 5678');
  });

  it('accepts international numbers with a prefix and rejects invalid numbers', () => {
    const normalizer = new PhoneNormalizerService();
    expect(normalizer.normalize('+1 202-555-0123', null)?.phoneNormalized).toBe('+12025550123');
    expect(() => normalizer.normalize('1234', 'CL')).toThrow(HttpException);
  });

  it('normalizes names and emails without changing the visible phone', () => {
    expect(normalizeWhitespace('  Juan   Pérez  ')).toBe('Juan Pérez');
    expect(normalizeEmailValue('  JUAN@Example.COM ')).toBe('juan@example.com');
  });

  it('requires at least one identity field', () => {
    expect(hasMinimumIdentity({})).toBe(false);
    expect(hasMinimumIdentity({ phone: '+56912345678' })).toBe(true);
    expect(hasMinimumIdentity({ email: 'lead@example.com' })).toBe(true);
  });

  it('generates the initial opportunity title deterministically', () => {
    expect(buildInitialOpportunityTitle('Juan', 'Pérez', '+56912345678')).toBe(
      'Interés de Juan Pérez',
    );
    expect(buildInitialOpportunityTitle(null, null, '+56912345678')).toBe('Lead +56912345678');
    expect(buildInitialOpportunityTitle(null, null, null)).toBe('Nuevo lead');
  });

  it('applies the seller ownership policy on the server', () => {
    const policy = new ContactAccessPolicy();
    const seller = user('Sales');
    expect(policy.canMutate(seller, { userId: null })).toBe(true);
    expect(policy.canMutate(seller, { userId: seller.userId })).toBe(true);
    expect(policy.canMutate(seller, { userId: '00000000-0000-0000-0000-000000000099' })).toBe(
      false,
    );
    expect(
      policy.canMutate(user('Owner'), { userId: '00000000-0000-0000-0000-000000000099' }),
    ).toBe(true);
    expect(policy.canMutate(user('Viewer', ['contacts.read']), { userId: null })).toBe(false);
  });
});
