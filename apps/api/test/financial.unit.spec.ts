import { ExpenseFrequency, ExpensePaymentMethod } from '@prisma/client';

import { isSupportedCurrency } from '../src/modules/commercial/currency';

describe('Financial Intelligence domain primitives', () => {
  it('accepts only currencies from the versioned catalog', () => {
    expect(isSupportedCurrency('CLP')).toBe(true);
    expect(isSupportedCurrency('USD')).toBe(true);
    expect(isSupportedCurrency('XYZ')).toBe(false);
  });

  it('defines recurring frequencies and payment methods without free-form values', () => {
    expect(ExpenseFrequency.MONTHLY).toBe('MONTHLY');
    expect(ExpenseFrequency.ANNUAL).toBe('ANNUAL');
    expect(ExpensePaymentMethod.TRANSFER).toBe('TRANSFER');
  });
});
