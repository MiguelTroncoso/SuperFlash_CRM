import { FulfillmentMode, ProductStatus, ProductType } from '@prisma/client';

import {
  buildInitialOpportunityTitle,
  hasMinimumIdentity,
  normalizeEmailValue,
  normalizeWhitespace,
} from '../src/modules/contacts/contacts.types';
import { PhoneNormalizerService } from '../src/modules/contacts/phone/phone-normalizer.service';

describe('Sprint 31 commercial UX contracts', () => {
  it('keeps the backend product enum contract aligned with the catalog form', () => {
    expect(Object.values(ProductType)).toEqual([
      'SUBSCRIPTION',
      'CREDIT_PACKAGE',
      'LICENSE',
      'SERVICE',
      'DIGITAL_ACCESS',
      'OTHER',
    ]);
    expect(Object.values(FulfillmentMode)).toEqual([
      'MANUAL',
      'API',
      'INVITATION',
      'CREDENTIALS',
      'DOWNLOAD',
      'OTHER',
    ]);
    expect(ProductStatus.ACTIVE).toBe('ACTIVE');
  });

  it('normalizes the lead identity without overwriting its visible phone', () => {
    const normalized = new PhoneNormalizerService().normalize('9 1234 5678', 'CL');
    expect(normalized).toEqual({ phone: '9 1234 5678', phoneNormalized: '+56912345678' });
    expect(normalizeWhitespace('  Juan   Pérez ')).toBe('Juan Pérez');
    expect(normalizeEmailValue(' JUAN@EXAMPLE.COM ')).toBe('juan@example.com');
    expect(hasMinimumIdentity({ phone: '+56912345678' })).toBe(true);
    expect(hasMinimumIdentity({})).toBe(false);
  });

  it('generates stable opportunity titles for named and phone-only leads', () => {
    expect(buildInitialOpportunityTitle('Juan', 'Pérez', '+56912345678')).toBe(
      'Interés de Juan Pérez',
    );
    expect(buildInitialOpportunityTitle(null, null, '+56912345678')).toBe('Lead +56912345678');
  });
});
