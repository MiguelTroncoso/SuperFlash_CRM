export interface FinancialRequestMetadata {
  readonly ipAddress?: string;
  readonly requestId?: string;
}

export interface FinancialDashboard {
  readonly month: string;
  readonly currency: string | null;
  readonly revenue: string;
  readonly expenses: string;
  readonly grossProfit: string;
  readonly netProfit: string;
  readonly marginPercent: number;
  readonly mrr: string;
  readonly arr: string;
  readonly estimatedCash: string;
  readonly fixedMonthlyCost: string;
  readonly variableCost: string;
  readonly breakEven: string;
  readonly previousMonth: {
    readonly revenue: string;
    readonly expenses: string;
    readonly netProfit: string;
  };
  readonly upcomingRecurringExpenses: Array<{
    readonly id: string;
    readonly name: string;
    readonly amount: string;
    readonly currency: string;
    readonly nextOccurrenceDate: Date | null;
  }>;
  readonly monthlyTrend: Array<{
    readonly month: string;
    readonly revenue: string;
    readonly expenses: string;
    readonly netProfit: string;
  }>;
}
