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

  it('guarantees grossAmount - feeAmount = netAmount', async () => {
    const gross = new Prisma.Decimal('100.00');
    const service = new CommissionsService(
      {
        paymentFeeConfig: {
          findFirst: jest.fn().mockResolvedValue({
            percentage: new Prisma.Decimal('5.40'),
            fixedFee: new Prisma.Decimal('0.30'),
            internationalPercentage: new Prisma.Decimal('0'),
            conversionPercentage: new Prisma.Decimal('0'),
          }),
        },
      } as never,
      {} as never,
    );

    const fee = await service.calculate({
      organizationId: 'organization-a',
      method: PaymentMethod.PAYPAL,
      grossAmount: gross,
    });
    // 100 * 0.054 + 0.30 = 5.70
    expect(fee).toEqual(new Prisma.Decimal('5.70'));
    const net = gross.sub(fee);
    expect(net).toEqual(new Prisma.Decimal('94.30'));
    expect(gross.sub(fee)).toEqual(net);
  });

  it('returns zero fee when no fee config exists for method', async () => {
    const service = new CommissionsService(
      {
        paymentFeeConfig: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as never,
      {} as never,
    );

    const gross = new Prisma.Decimal('50.00');
    const fee = await service.calculate({
      organizationId: 'organization-a',
      method: PaymentMethod.TRANSFER,
      grossAmount: gross,
    });
    expect(fee).toEqual(new Prisma.Decimal(0));
    expect(gross.sub(fee)).toEqual(gross);
  });
});
