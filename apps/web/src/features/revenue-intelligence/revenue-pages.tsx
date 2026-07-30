'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ColumnDef } from '@tanstack/react-table';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { CountrySelect } from '@/components/shared/country-phone-field';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Input, Select } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import { api, queryString } from '@/lib/api-client';
import type {
  RevenueCohortRow,
  RevenueFilters,
  RevenueKpis,
  RevenueMoneyMetric,
  RevenueTrendPoint,
} from '@/lib/types';

const CURRENCIES = ['USD', 'CLP', 'COP', 'MXN', 'PEN', 'BOB', 'EUR'] as const;

const chartTooltipStyle = {
  backgroundColor: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 12,
  color: 'var(--content-primary)',
};

function money(metric: RevenueMoneyMetric | undefined): string {
  return metric
    ? `${metric.currency} ${Number(metric.amount).toLocaleString('es-CL', { maximumFractionDigits: 2 })}`
    : '—';
}

function useRevenueFilters(): {
  filters: RevenueFilters;
  query: string;
  setFilters: (filters: RevenueFilters) => void;
} {
  const [filters, setFilters] = useState<RevenueFilters>({});
  return { filters, query: useMemo(() => queryString({ ...filters }), [filters]), setFilters };
}

function FilterBar({
  filters,
  onChange,
}: {
  readonly filters: RevenueFilters;
  readonly onChange: (filters: RevenueFilters) => void;
}): React.ReactElement {
  const sellers = useQuery({
    queryKey: ['revenue-sellers'],
    queryFn: api.getContactAssignees,
  });
  const sellerOptions = Array.isArray(sellers.data) ? sellers.data : [];
  const update = (key: keyof RevenueFilters, value: string): void =>
    onChange({ ...filters, [key]: value || undefined });
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-5">
        <label className="text-xs font-semibold text-content-secondary">
          Desde
          <Input
            className="mt-1 uppercase"
            onChange={(event) => update('from', event.target.value)}
            type="date"
            value={filters.from ?? ''}
          />
        </label>
        <label className="text-xs font-semibold text-content-secondary">
          Hasta
          <Input
            className="mt-1 uppercase"
            onChange={(event) => update('to', event.target.value)}
            type="date"
            value={filters.to ?? ''}
          />
        </label>
        <label className="text-xs font-semibold text-content-secondary">
          País
          <CountrySelect
            className="mt-1"
            onChange={(value) => update('country', value)}
            value={filters.country ?? ''}
          />
        </label>
        <label className="text-xs font-semibold text-content-secondary">
          Moneda
          <Select
            className="mt-1"
            onChange={(event) => update('currency', event.target.value)}
            value={filters.currency ?? ''}
          >
            <option value="">Todas las monedas</option>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs font-semibold text-content-secondary">
          Vendedor
          <Select
            className="mt-1"
            onChange={(event) => update('sellerId', event.target.value)}
            value={filters.sellerId ?? ''}
          >
            <option value="">Todos los vendedores</option>
            {sellerOptions.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.firstName} {seller.lastName ?? ''}
              </option>
            ))}
          </Select>
        </label>
      </CardContent>
    </Card>
  );
}

function Layout({
  title,
  description,
  filters,
  onFilters,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly filters: RevenueFilters;
  readonly onFilters: (filters: RevenueFilters) => void;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();
  const tabs = [
    { href: '/revenue', label: 'Dashboard' },
    { href: '/revenue/kpis', label: 'KPIs' },
    { href: '/revenue/funnels', label: 'Funnels' },
    { href: '/revenue/cohorts', label: 'Cohortes' },
    { href: '/revenue/forecast', label: 'Forecast' },
  ];
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Revenue Intelligence · Phase 1"
        title={title}
        description={description}
      />
      <nav
        aria-label="Revenue Intelligence"
        className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0"
      >
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link href={tab.href} key={tab.href}>
                <Button className="shrink-0" variant={active ? 'primary' : 'outline'}>
                  {tab.label}
                </Button>
              </Link>
            );
          })}
        </div>
      </nav>
      <FilterBar filters={filters} onChange={onFilters} />
      {children}
    </PageGrid>
  );
}

function KpiCards({ kpis }: { readonly kpis: RevenueKpis }): React.ReactElement {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        icon="↗"
        label="Ventas del mes"
        value={money(kpis.salesMonth[0])}
        trend="Confirmadas y fulfilled"
      />
      <MetricCard icon="▣" label="MRR" value={money(kpis.mrr[0])} trend="Suscripciones activas" />
      <MetricCard
        icon="◎"
        label="Clientes activos"
        value={kpis.activeCustomers}
        trend={`${kpis.newCustomers} nuevos en período`}
      />
      <MetricCard
        icon="◌"
        label="Churn"
        value={`${kpis.churnRate.toFixed(2)}%`}
        trend={`${kpis.successfulRenewals} renovaciones pagadas`}
      />
    </div>
  );
}

export function ExecutiveDashboardPage(): React.ReactElement {
  const { filters, query, setFilters } = useRevenueFilters();
  const result = useQuery({
    queryKey: ['revenue-dashboard', query],
    queryFn: () => api.getRevenueDashboard(query),
  });
  const chart =
    result.data?.trends.map((point) => ({ date: point.date, revenue: Number(point.revenue) })) ??
    [];
  return (
    <Layout
      title="Dashboard ejecutivo"
      description="Lectura consolidada de ingresos, clientes, embudo y forecast histórico."
      filters={filters}
      onFilters={setFilters}
    >
      <QueryState
        isLoading={result.isLoading}
        isError={result.isError}
        onRetry={() => void result.refetch()}
      >
        {result.data ? (
          <>
            <KpiCards kpis={result.data.kpis} />
            <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Tendencia de revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56 sm:h-72">
                    {chart.length ? (
                      <ResponsiveContainer height="100%" width="100%">
                        <AreaChart data={chart}>
                          <CartesianGrid
                            stroke="var(--border-default)"
                            strokeDasharray="4 4"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: 'var(--content-muted)', fontSize: 10 }}
                          />
                          <YAxis tick={{ fill: 'var(--content-muted)', fontSize: 10 }} />
                          <Tooltip contentStyle={chartTooltipStyle} />
                          <Area
                            dataKey="revenue"
                            fill="var(--brand-50)"
                            stroke="#6366f1"
                            strokeWidth={3}
                            type="monotone"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">
                        Sin ventas para este período.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Embudo comercial</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {result.data.funnel.stages.map((stage) => (
                      <div key={stage.key}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="font-semibold">{stage.label}</span>
                          <span>
                            {stage.count} · {stage.conversionRate.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${Math.min(stage.conversionRate, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Indicadores de ciclo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    icon="◷"
                    label="Tiempo hasta venta"
                    value={`${result.data.kpis.averageTimeToSaleDays.toFixed(1)} días`}
                  />
                  <MetricCard
                    icon="✓"
                    label="Trial → venta"
                    value={`${result.data.kpis.trialToSaleRate.toFixed(1)}%`}
                  />
                  <MetricCard
                    icon="▤"
                    label="Ticket promedio"
                    value={money(result.data.kpis.averageTicket[0])}
                  />
                  <MetricCard
                    icon="⌁"
                    label="LTV básico"
                    value={money(result.data.kpis.ltvBasic[0])}
                  />
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </QueryState>
    </Layout>
  );
}

export function RevenueKpisPage(): React.ReactElement {
  const { filters, query, setFilters } = useRevenueFilters();
  const result = useQuery({
    queryKey: ['revenue-kpis', query],
    queryFn: () => api.getRevenueKpis(query),
  });
  const groups = result.data
    ? ([
        ['Etapas', result.data.data.conversionByStage],
        ['Vendedores', result.data.data.conversionBySeller],
        ['Países', result.data.data.conversionByCountry],
      ] as const)
    : [];
  return (
    <Layout
      title="KPIs comerciales"
      description="Indicadores operacionales calculados con reglas documentadas."
      filters={filters}
      onFilters={setFilters}
    >
      <QueryState
        isLoading={result.isLoading}
        isError={result.isError}
        onRetry={() => void result.refetch()}
      >
        {result.data ? (
          <>
            <KpiCards kpis={result.data.data} />
            <Card>
              <CardHeader>
                <CardTitle>Conversión por vendedor, país y etapa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 lg:grid-cols-3">
                  {groups.map(([title, rows]) => (
                    <div key={title}>
                      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                        {title}
                      </h3>
                      <div className="space-y-2">
                        {rows.map((row) => (
                          <div
                            className="flex items-center justify-between rounded-xl bg-surface-inset p-3 text-xs"
                            key={row.key}
                          >
                            <span className="font-semibold">{row.label}</span>
                            <span className="text-slate-500">
                              {row.conversions}/{row.opportunities} ·{' '}
                              {row.conversionRate.toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </QueryState>
    </Layout>
  );
}

export function RevenueFunnelsPage(): React.ReactElement {
  const { filters, query, setFilters } = useRevenueFilters();
  const compareQuery = `${query}${query ? '&' : '?'}compare=true`;
  const result = useQuery({
    queryKey: ['revenue-funnels', compareQuery],
    queryFn: () => api.getRevenueFunnels(compareQuery),
  });
  return (
    <Layout
      title="Funnels configurables"
      description="Compara la progresión del período actual contra el anterior."
      filters={filters}
      onFilters={setFilters}
    >
      <QueryState
        isLoading={result.isLoading}
        isError={result.isError}
        onRetry={() => void result.refetch()}
      >
        {result.data ? (
          <Card>
            <CardHeader>
              <CardTitle>{result.data.data.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {result.data.data.stages.map((stage, index) => (
                  <div key={stage.key}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="font-bold">
                        {index + 1}. {stage.label}
                      </span>
                      <span>
                        {stage.count} · {stage.conversionRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-4 rounded-full bg-surface-muted">
                      <div
                        className="h-4 rounded-full bg-brand-500"
                        style={{
                          width: `${Math.max(stage.count ? 4 : 0, Math.min(stage.conversionRate, 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {result.data.data.comparison ? (
                <p className="mt-5 text-xs text-slate-500">
                  Comparación disponible para el período anterior.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </QueryState>
    </Layout>
  );
}

const cohortColumns: ColumnDef<RevenueCohortRow, unknown>[] = [
  { accessorKey: 'cohortMonth', header: 'Cohorte' },
  { accessorKey: 'period', header: 'Período' },
  { accessorKey: 'currency', header: 'Moneda' },
  { accessorKey: 'acquired', header: 'Adquiridos' },
  { accessorKey: 'retained', header: 'Retenidos' },
  {
    accessorKey: 'retentionRate',
    header: 'Retención',
    cell: ({ row }) => `${row.original.retentionRate.toFixed(1)}%`,
  },
  { accessorKey: 'revenue', header: 'Revenue' },
];

export function RevenueCohortsPage(): React.ReactElement {
  const { filters, query, setFilters } = useRevenueFilters();
  const result = useQuery({
    queryKey: ['revenue-cohorts', query],
    queryFn: () => api.getRevenueCohorts(query),
  });
  return (
    <Layout
      title="Cohortes"
      description="Retención y revenue por mes de primera compra, producto, país o vendedor."
      filters={filters}
      onFilters={setFilters}
    >
      <QueryState
        isLoading={result.isLoading}
        isError={result.isError}
        onRetry={() => void result.refetch()}
      >
        {result.data ? (
          <Card>
            <DataTable
              columns={cohortColumns}
              data={result.data.data}
              virtualize
              emptyTitle="Sin cohortes"
              emptyDescription="Aún no hay ventas confirmadas en el período."
            />
          </Card>
        ) : null}
      </QueryState>
    </Layout>
  );
}

export function RevenueTrendsPage(): React.ReactElement {
  const { filters, query, setFilters } = useRevenueFilters();
  const result = useQuery({
    queryKey: ['revenue-trends', query],
    queryFn: () => api.getRevenueTrends(query),
  });
  const chart =
    result.data?.data.map((point: RevenueTrendPoint) => ({
      date: point.date,
      revenue: Number(point.revenue),
    })) ?? [];
  return (
    <Layout
      title="Tendencias"
      description="Evolución diaria de revenue, ventas y clientes."
      filters={filters}
      onFilters={setFilters}
    >
      <QueryState
        isLoading={result.isLoading}
        isError={result.isError}
        onRetry={() => void result.refetch()}
      >
        {result.data ? (
          <Card>
            <CardContent>
              <div className="h-64 sm:h-[420px]">
                {chart.length ? (
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart data={chart}>
                      <CartesianGrid
                        stroke="var(--border-default)"
                        strokeDasharray="4 4"
                        vertical={false}
                      />
                      <XAxis dataKey="date" tick={{ fill: 'var(--content-muted)', fontSize: 10 }} />
                      <YAxis tick={{ fill: 'var(--content-muted)', fontSize: 10 }} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Bar dataKey="revenue" fill="var(--brand-500)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    Sin tendencia disponible.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </QueryState>
    </Layout>
  );
}

export function RevenueForecastPage(): React.ReactElement {
  const { filters, query, setFilters } = useRevenueFilters();
  const result = useQuery({
    queryKey: ['revenue-forecast', query],
    queryFn: () => api.getRevenueForecast(query),
  });
  return (
    <Layout
      title="Forecast básico"
      description="Proyección histórica con tendencia lineal; no usa IA ni fuentes externas."
      filters={filters}
      onFilters={setFilters}
    >
      <QueryState
        isLoading={result.isLoading}
        isError={result.isError}
        onRetry={() => void result.refetch()}
      >
        {result.data ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {result.data.data.map((forecast) => (
              <Card key={forecast.currency}>
                <CardHeader>
                  <CardTitle>
                    {forecast.currency} · próximos {forecast.horizonMonths} meses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {forecast.forecast.map((point) => (
                      <div
                        className="flex items-center justify-between rounded-xl bg-surface-inset p-3 text-sm"
                        key={point.month}
                      >
                        <span className="font-semibold">{point.month}</span>
                        <span className="font-bold text-brand-600">
                          {forecast.currency} {point.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-slate-500">
                    Método: {forecast.method}. Usar como señal orientativa.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </QueryState>
    </Layout>
  );
}
