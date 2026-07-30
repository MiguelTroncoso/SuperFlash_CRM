export interface RevenueFilters {
  organizationId: string;
  from: Date;
  to: Date;
  country?: string;
  sellerId?: string;
  productId?: string;
  providerId?: string;
  currency?: string;
}

export interface RevenueMoneyMetric {
  currency: string;
  amount: string;
  count: number;
}

export interface RevenueConversionRow {
  key: string;
  label: string;
  opportunities: number;
  conversions: number;
  conversionRate: number;
}

export interface RevenueKpis {
  salesToday: RevenueMoneyMetric[];
  salesMonth: RevenueMoneyMetric[];
  mrr: RevenueMoneyMetric[];
  arr: RevenueMoneyMetric[];
  newCustomers: number;
  activeCustomers: number;
  lostCustomers: number;
  averageTimeToSaleDays: number;
  averageActivationDays: number;
  averageCloseDays: number;
  successfulRenewals: number;
  churnRate: number;
  trialToSaleRate: number;
  averageTicket: RevenueMoneyMetric[];
  ltvBasic: RevenueMoneyMetric[];
  conversionByStage: RevenueConversionRow[];
  conversionBySeller: RevenueConversionRow[];
  conversionByCountry: RevenueConversionRow[];
}

export interface RevenueTrendPoint {
  date: string;
  currency: string;
  revenue: string;
  sales: number;
  customers: number;
}

export interface RevenueFunnelStage {
  key: string;
  label: string;
  count: number;
  conversionRate: number;
}

export interface RevenueFunnelResult {
  name: string;
  stages: RevenueFunnelStage[];
  comparison?: RevenueFunnelStage[];
}

export interface RevenueCohortRow {
  cohortMonth: string;
  period: number;
  acquired: number;
  retained: number;
  retentionRate: number;
  revenue: string;
  currency: string;
}

export interface RevenueForecastPoint {
  month: string;
  amount: string;
}

export interface RevenueForecast {
  currency: string;
  method: 'HISTORICAL_MOVING_TREND';
  history: RevenueForecastPoint[];
  forecast: RevenueForecastPoint[];
  horizonMonths: number;
}

export interface RevenueDashboard {
  generatedAt: string;
  filters: Omit<RevenueFilters, 'organizationId'>;
  kpis: RevenueKpis;
  trends: RevenueTrendPoint[];
  funnel: RevenueFunnelResult;
  forecast: RevenueForecast[];
  communication: WhatsAppReadOnlyMetrics;
}
import type { WhatsAppReadOnlyMetrics } from '../communication/services/whatsapp-readonly-analytics.service';
