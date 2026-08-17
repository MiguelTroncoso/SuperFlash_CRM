import { PaymentMethod, Prisma } from '@prisma/client';

import { CommissionsService } from '../src/modules/commissions/commissions.service';

describe('payment commission engine', () => {
  it('calculates PayPal fee using percentage plus fixed fee', async () => {
    const service = new CommissionsService(
      {
        paymentFeeConfig: {
          findFirst: jest.fn().mockResolvedValue({
            percentage: new Prisma.Decimal('4.95'),
            fixedFee: new Prisma.Decimal('0.49'),
            internationalPercentage: new Prisma.Decimal('0'),
            conversionPercentage: new Prisma.Decimal('0'),
          }),
        },
      } as never,
      {} as never,
    );

    await expect(
      service.calculate({
        organizationId: 'organization-a',
        method: PaymentMethod.PAYPAL,
        grossAmount: new Prisma.Decimal('20'),
      }),
    ).resolves.toEqual(new Prisma.Decimal('1.48'));
  });

  it('adds configured international and conversion percentages', async () => {
    const service = new CommissionsService(
      {
        paymentFeeConfig: {
          findFirst: jest.fn().mockResolvedValue({
            percentage: new Prisma.Decimal('2'),
            fixedFee: new Prisma.Decimal('1'),
            internationalPercentage: new Prisma.Decimal('1'),
            conversionPercentage: new Prisma.Decimal('0.5'),
          }),
        },
      } as never,
      {} as never,
    );

    await expect(
      service.calculate({
        organizationId: 'organization-a',
        method: PaymentMethod.STRIPE,
        grossAmount: new Prisma.Decimal('100'),
        isInternational: true,
        currencyConversion: true,
      }),
    ).resolves.toEqual(new Prisma.Decimal('4.50'));
  });
});
