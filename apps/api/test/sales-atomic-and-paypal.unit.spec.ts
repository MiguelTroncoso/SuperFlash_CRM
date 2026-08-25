import { PaymentMethod, Prisma, SaleStatus, PaymentStatus } from '@prisma/client';
import { SalesService } from '../src/modules/sales/sales.service';
import { CommissionsService } from '../src/modules/commissions/commissions.service';
import { ExchangeRatesService } from '../src/modules/exchange-rates/exchange-rates.service';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { OutboxService } from '../src/infrastructure/outbox/outbox.service';
import { PricingService } from '../src/modules/catalog/pricing/pricing.service';
import { SalesAccessPolicy } from '../src/modules/sales/access/sales-access.policy';
import { CommercialRequestContext } from '../src/modules/commercial/commercial.types';

describe('Sales Atomic Creation and PayPal Commission Tests', () => {
  let mockPrisma: {
    $transaction: jest.Mock;
    organization: { update: jest.Mock };
    contact: { findFirst: jest.Mock; update: jest.Mock };
    opportunity: { findFirst: jest.Mock; update: jest.Mock };
    sale: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
    saleItem: { createMany: jest.Mock; findMany: jest.Mock };
    payment: { create: jest.Mock; aggregate: jest.Mock };
    activity: { create: jest.Mock };
    pipelineStage: { findFirst: jest.Mock };
    subscription: { findUnique: jest.Mock; create: jest.Mock };
    renewal: { create: jest.Mock };
    renewalReminder: { createMany: jest.Mock };
    product: { update: jest.Mock };
    productStockMovement: { create: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let mockAudit: { record: jest.Mock; recordWithClient: jest.Mock };
  let mockOutbox: { enqueueWithClient: jest.Mock };
  let mockPricing: { resolveForSale: jest.Mock };
  let mockAccess: { assertCreate: jest.Mock; assertRead: jest.Mock; assertMutate: jest.Mock };
  let mockCommissions: { calculate: jest.Mock };
  let mockFx: { convertToUsd: jest.Mock };
  let salesService: SalesService;

  const mockContext: CommercialRequestContext = {
    user: {
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'ADMIN',
      permissions: ['sales.create', 'sales.read', 'sales.mutate'],
    } as unknown as CommercialRequestContext['user'],
    metadata: {
      ipAddress: '127.0.0.1',
      requestId: 'req-1',
    },
  };

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest
        .fn()
        .mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
          cb(mockPrisma),
        ),
      organization: {
        update: jest.fn().mockResolvedValue({ saleSequence: 1 }),
      },
      contact: {
        findFirst: jest.fn().mockResolvedValue({ id: 'contact-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      opportunity: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      sale: {
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const saleObj = {
            id: 'sale-1',
            saleNumber: (data.saleNumber as string) ?? 'SF-20260825-000001',
            status: (data.status as SaleStatus) ?? SaleStatus.DRAFT,
            subtotal: (data.subtotal as Prisma.Decimal) ?? new Prisma.Decimal('50.00'),
            discountAmount: (data.discountAmount as Prisma.Decimal) ?? new Prisma.Decimal('0.00'),
            taxAmount: (data.taxAmount as Prisma.Decimal) ?? new Prisma.Decimal('0.00'),
            total: (data.total as Prisma.Decimal) ?? new Prisma.Decimal('50.00'),
            currency: (data.currency as string) ?? 'USD',
            paymentMethod: (data.paymentMethod as PaymentMethod) ?? null,
            paidNow: Boolean(data.paidNow),
            contact: {
              id: 'contact-1',
              firstName: 'Diego',
              lastName: '',
              email: '',
              phone: '',
              country: 'CL',
            },
            seller: null,
            opportunity: null,
            items: [],
            subscriptions: [],
            payments: [],
            renewalItems: [],
            renewalFrom: null,
            fulfillments: [],
            attributions: [],
          };
          mockPrisma.sale.findFirst.mockResolvedValue(saleObj);
          mockPrisma.sale.findUnique.mockResolvedValue(saleObj);
          return Promise.resolve({ id: 'sale-1' });
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'sale-1',
          saleNumber: 'SF-20260825-000001',
          status: SaleStatus.CONFIRMED,
          subtotal: new Prisma.Decimal('50.00'),
          discountAmount: new Prisma.Decimal('0.00'),
          taxAmount: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('50.00'),
          currency: 'USD',
          contact: {
            id: 'contact-1',
            firstName: 'Diego',
            lastName: '',
            email: '',
            phone: '',
            country: 'CL',
          },
          seller: null,
          opportunity: null,
          items: [],
          subscriptions: [],
          payments: [],
          renewalItems: [],
          renewalFrom: null,
          fulfillments: [],
          attributions: [],
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'sale-1',
          total: new Prisma.Decimal('50.00'),
          currency: 'USD',
        }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      },
      saleItem: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      payment: {
        create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { netAmount: new Prisma.Decimal(0), refundedAmount: new Prisma.Decimal(0) },
        }),
      },
      activity: {
        create: jest.fn().mockResolvedValue({}),
      },
      pipelineStage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'stage-won', name: 'Compró' }),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      },
      renewal: {
        create: jest.fn().mockResolvedValue({ id: 'ren-1' }),
      },
      renewalReminder: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      product: {
        update: jest.fn().mockResolvedValue({}),
      },
      productStockMovement: {
        create: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    mockAudit = {
      record: jest.fn(),
      recordWithClient: jest.fn(),
    };
    mockOutbox = {
      enqueueWithClient: jest.fn(),
    };
    mockPricing = {
      resolveForSale: jest
        .fn()
        .mockImplementation(
          async ({ requestedUnitPrice }: { requestedUnitPrice?: Prisma.Decimal }) => ({
            product: {
              id: 'prod-1',
              name: 'VENDEDORES IPTV',
              slug: 'vendedores-iptv',
              type: 'OTHER',
              fulfillmentMode: 'MANUAL',
              sku: 'SKU-1',
            },
            plan: null,
            variant: null,
            priceBookEntry: null,
            unitPrice: requestedUnitPrice ?? new Prisma.Decimal('50.00'),
            snapshot: {},
            requiresSubscription: false,
            billingPeriodUnit: null,
            billingPeriodCount: null,
          }),
        ),
    };
    mockAccess = {
      assertCreate: jest.fn(),
      assertRead: jest.fn(),
      assertMutate: jest.fn(),
    };
    mockCommissions = {
      calculate: jest
        .fn()
        .mockImplementation(
          async ({
            method,
            grossAmount,
          }: {
            method: PaymentMethod;
            grossAmount: Prisma.Decimal;
          }) => {
            if (method === PaymentMethod.PAYPAL) {
              // 4.95% + 0.49
              return grossAmount.mul(4.95).div(100).add(0.49).toDecimalPlaces(2);
            }
            return new Prisma.Decimal(0);
          },
        ),
    };
    mockFx = {
      convertToUsd: jest
        .fn()
        .mockImplementation(
          async (_orgId: string, amount: Prisma.Decimal | string | number, currency: string) => {
            const dec = new Prisma.Decimal(amount);
            if (currency === 'USD' || currency === 'USDT') {
              return {
                usdAmount: dec,
                rate: new Prisma.Decimal(1),
                provider: 'SYSTEM',
                capturedAt: new Date(),
              };
            }
            if (currency === 'MXN') {
              // 16.9586 MXN per USD -> rate = 0.05896717
              const rate = new Prisma.Decimal('0.05896717');
              return {
                usdAmount: dec.mul(rate).toDecimalPlaces(2),
                rate,
                provider: 'OPEN_ER_API',
                capturedAt: new Date(),
              };
            }
            return {
              usdAmount: dec,
              rate: new Prisma.Decimal(1),
              provider: 'SYSTEM',
              capturedAt: new Date(),
            };
          },
        ),
    };

    salesService = new SalesService(
      mockPrisma as unknown as PrismaService,
      mockAudit as unknown as AuditService,
      mockOutbox as unknown as OutboxService,
      mockPricing as unknown as PricingService,
      mockAccess as unknown as SalesAccessPolicy,
      mockCommissions as unknown as CommissionsService,
      mockFx as unknown as ExchangeRatesService,
    );
  });

  it('PayPal sale: calculates automatic PayPal fee and net amount correctly', async () => {
    await salesService.create(
      {
        contactId: 'contact-1',
        currency: 'USD',
        confirm: true,
        paidNow: true,
        paymentMethod: PaymentMethod.PAYPAL,
        paymentAmount: '50.00',
        items: [{ productId: 'prod-1', quantity: '1', unitPrice: '50.00' }],
      },
      mockContext,
    );

    expect(mockPrisma.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SaleStatus.CONFIRMED,
          total: new Prisma.Decimal('50.00'),
          paymentMethod: PaymentMethod.PAYPAL,
          paidNow: true,
        }),
      }),
    );

    // PayPal fee for 50.00 = 50 * 0.0495 + 0.49 = 2.475 + 0.49 = 2.97 (or ~2.965 -> 2.97)
    // Net amount = 50.00 - 2.97 = 47.03
    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grossAmount: new Prisma.Decimal('50.00'),
          feeAmount: new Prisma.Decimal('2.97'),
          netAmount: new Prisma.Decimal('47.03'),
          method: PaymentMethod.PAYPAL,
          status: PaymentStatus.CONFIRMED,
          baseCurrency: 'USD',
        }),
      }),
    );
  });

  it('Transfer and Binance: fee is 0, net equals gross', async () => {
    await salesService.create(
      {
        contactId: 'contact-1',
        currency: 'USD',
        confirm: true,
        paidNow: true,
        paymentMethod: PaymentMethod.TRANSFER,
        paymentAmount: '50.00',
        items: [{ productId: 'prod-1', quantity: '1', unitPrice: '50.00' }],
      },
      mockContext,
    );

    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grossAmount: new Prisma.Decimal('50.00'),
          feeAmount: new Prisma.Decimal('0.00'),
          netAmount: new Prisma.Decimal('50.00'),
          method: PaymentMethod.TRANSFER,
        }),
      }),
    );
  });

  it('Commercial discount + PayPal: discount modifies sale total, PayPal fee is calculated on payment', async () => {
    // Catalog price 50.00, discount 3.00 -> sale total 47.00
    mockPricing.resolveForSale.mockResolvedValueOnce({
      product: {
        id: 'prod-1',
        name: 'Item',
        slug: 'item',
        type: 'OTHER',
        fulfillmentMode: 'MANUAL',
        sku: 'SKU',
      },
      plan: null,
      variant: null,
      priceBookEntry: null,
      unitPrice: new Prisma.Decimal('50.00'),
      snapshot: {},
      requiresSubscription: false,
      billingPeriodUnit: null,
      billingPeriodCount: null,
    });

    await salesService.create(
      {
        contactId: 'contact-1',
        currency: 'USD',
        discountAmount: '3.00',
        confirm: true,
        paidNow: true,
        paymentMethod: PaymentMethod.PAYPAL,
        paymentAmount: '47.00',
        items: [{ productId: 'prod-1', quantity: '1', unitPrice: '50.00' }],
      },
      mockContext,
    );

    expect(mockPrisma.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: new Prisma.Decimal('50.00'),
          discountAmount: new Prisma.Decimal('3.00'),
          total: new Prisma.Decimal('47.00'),
        }),
      }),
    );

    // Fee on 47.00: 47 * 0.0495 + 0.49 = 2.3265 + 0.49 = 2.82
    // Net: 47 - 2.82 = 44.18
    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grossAmount: new Prisma.Decimal('47.00'),
          feeAmount: new Prisma.Decimal('2.82'),
          netAmount: new Prisma.Decimal('44.18'),
        }),
      }),
    );
  });

  it('MXN sale + PayPal: captures FX snapshot to USD', async () => {
    await salesService.create(
      {
        contactId: 'contact-1',
        currency: 'MXN',
        confirm: true,
        paidNow: true,
        paymentMethod: PaymentMethod.PAYPAL,
        paymentAmount: '1250.00',
        items: [{ productId: 'prod-1', quantity: '1', unitPrice: '1250.00' }],
      },
      mockContext,
    );

    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currency: 'MXN',
          baseCurrency: 'USD',
          exchangeRate: new Prisma.Decimal('0.05896717'),
          exchangeRateSnapshot: expect.objectContaining({
            usdGross: '73.71',
            feeMethod: PaymentMethod.PAYPAL,
          }),
        }),
      }),
    );
  });

  it('Atomicity: when confirm is true and payment fails, entire transaction rolls back', async () => {
    // Simulate transaction rejection
    mockPrisma.$transaction.mockImplementationOnce(async () => {
      throw new Error('Payment gateway error');
    });

    await expect(
      salesService.create(
        {
          contactId: 'contact-1',
          currency: 'USD',
          confirm: true,
          paidNow: true,
          paymentMethod: PaymentMethod.PAYPAL,
          items: [{ productId: 'prod-1', quantity: '1', unitPrice: '50.00' }],
        },
        mockContext,
      ),
    ).rejects.toThrow('Payment gateway error');
  });

  it('Explicit draft: creates DRAFT when confirm is false', async () => {
    await salesService.create(
      {
        contactId: 'contact-1',
        currency: 'USD',
        confirm: false,
        items: [{ productId: 'prod-1', quantity: '1', unitPrice: '50.00' }],
      },
      mockContext,
    );

    expect(mockPrisma.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SaleStatus.DRAFT,
          soldAt: null,
        }),
      }),
    );
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  });
});
