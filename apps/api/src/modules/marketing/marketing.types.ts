import { Prisma } from '@prisma/client';

export interface MarketingRequestMetadata {
  readonly ipAddress?: string;
  readonly requestId?: string;
}

export interface PerformanceRow {
  id: string;
  name: string;
  platform: string;
  source: string;
  currency: string;
  spend: Prisma.Decimal | string | number | null;
  conversations: number | bigint;
  contacts: number | bigint;
  demos: number | bigint;
  sales: number | bigint;
  grossRevenue: Prisma.Decimal | string | number | null;
  netRevenue: Prisma.Decimal | string | number | null;
  productCost: Prisma.Decimal | string | number | null;
  fulfillmentCost: Prisma.Decimal | string | number | null;
  unanswered: number | bigint;
  averageFollowUps: Prisma.Decimal | string | number | null;
  averageTimeToSaleSeconds: Prisma.Decimal | string | number | null;
}

export interface PerformanceMetric {
  readonly currency: string;
  readonly spend: string;
  readonly conversations: number;
  readonly contacts: number;
  readonly demos: number;
  readonly sales: number;
  readonly grossRevenue: string;
  readonly netRevenue: string;
  readonly profit: string | null;
  readonly costPerConversation: string | null;
  readonly costPerContact: string | null;
  readonly costPerDemo: string | null;
  readonly cpa: string | null;
  readonly grossRoas: string | null;
  readonly netRoas: string | null;
  readonly conversationToDemoConversion: string | null;
  readonly demoToSaleConversion: string | null;
  readonly conversationToSaleConversion: string | null;
  readonly averageTicket: string | null;
  readonly averageTimeToSaleSeconds: number | null;
  readonly unansweredPercentage: string | null;
  readonly averageFollowUpsBeforePurchase: string | null;
}

export interface CsvRecord {
  [key: string]: string;
}
