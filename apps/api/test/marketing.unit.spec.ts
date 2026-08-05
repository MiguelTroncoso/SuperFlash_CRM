import { Prisma } from '@prisma/client';

import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { MarketingService } from '../src/modules/marketing/marketing.service';
import { PerformanceMetric, PerformanceRow } from '../src/modules/marketing/marketing.types';
import { OutboxService } from '../src/infrastructure/outbox/outbox.service';

type PerformanceMapper = {
  toPerformance: (row: PerformanceRow) => PerformanceMetric & {
    campaignId: string;
    campaignName: string;
    platform: string;
    source: string;
  };
};

function row(overrides: Partial<PerformanceRow> = {}): PerformanceRow {
  return {
    id: 'campaign-1',
    name: 'Campaña principal',
    platform: 'META_ADS',
    source: 'PAID',
    currency: 'CLP',
    spend: '100.00',
    conversations: 20,
    contacts: 15,
    demos: 10,
    sales: 2,
    grossRevenue: '500.00',
    netRevenue: '450.00',
    productCost: '100.00',
    fulfillmentCost: '50.00',
    unanswered: 0,
    averageFollowUps: null,
    averageTimeToSaleSeconds: 172800,
    ...overrides,
  };
}

function mapper(): PerformanceMapper {
  const service = new MarketingService(
    {} as unknown as PrismaService,
    {} as unknown as AuditService,
    {} as unknown as OutboxService,
  );
  return service as unknown as PerformanceMapper;
}

describe('Marketing attribution and profitability calculations', () => {
  it('calculates profit from net revenue minus product and fulfillment costs', () => {
    const result = mapper().toPerformance(row());

    expect(result.profit).toBe('300.00');
    expect(result.netRevenue).toBe('450.00');
    expect(result.netRoas).toBe('4.5000');
  });

  it('calculates funnel rates and acquisition costs from persisted counters', () => {
    const result = mapper().toPerformance(row());

    expect(result.costPerConversation).toBe('5.0000');
    expect(result.costPerContact).toBe('6.6667');
    expect(result.costPerDemo).toBe('10.0000');
    expect(result.cpa).toBe('50.0000');
    expect(result.conversationToDemoConversion).toBe('50.00');
    expect(result.demoToSaleConversion).toBe('20.00');
    expect(result.conversationToSaleConversion).toBe('10.00');
  });

  it('returns null for ratios whose denominator is zero', () => {
    const result = mapper().toPerformance(
      row({
        spend: '0.00',
        conversations: 0,
        contacts: 0,
        demos: 0,
        sales: 0,
        netRevenue: '0.00',
        productCost: '0.00',
        fulfillmentCost: '0.00',
      }),
    );

    expect(result.profit).toBe(null);
    expect(result.costPerConversation).toBe(null);
    expect(result.cpa).toBe(null);
    expect(result.grossRoas).toBe(null);
  });

  it('accepts bigint counters returned by PostgreSQL aggregates', () => {
    const result = mapper().toPerformance(
      row({ conversations: BigInt(4), contacts: BigInt(3), demos: BigInt(2), sales: BigInt(1) }),
    );

    expect(result.conversations).toBe(4);
    expect(result.sales).toBe(1);
    expect(result.averageTicket).toBe('500.00');
  });

  it('preserves the campaign identity and time-to-sale metric for dashboard grouping', () => {
    const result = mapper().toPerformance(
      row({ averageTimeToSaleSeconds: new Prisma.Decimal('86400') }),
    );

    expect(result.campaignId).toBe('campaign-1');
    expect(result.campaignName).toBe('Campaña principal');
    expect(result.averageTimeToSaleSeconds).toBe(86400);
  });
});
