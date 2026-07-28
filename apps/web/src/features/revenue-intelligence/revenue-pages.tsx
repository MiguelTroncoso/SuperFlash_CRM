'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { MetricCard } from '@/components/ui/metric-card';
import { api, queryString } from '@/lib/api-client';
import type {
  RevenueCohortRow,
  RevenueFilters,
  RevenueKpis,
  RevenueMoneyMetric,
  RevenueTrendPoint,
} from '@/lib/types';

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
  const field = (
    key: keyof RevenueFilters,
    label: string,
    type: 'date' | 'text',
    placeholder?: string,
  ): React.ReactElement => (
    <label className="text-xs font-semibold text-slate-500" key={key}>
      {label}
      <input
        className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm uppercase dark:border-slate-700 dark:bg-slate-900"
        maxLength={
          type === 'date' ? undefined : key === 'country' ? 2 : key === 'currency' ? 3 : undefined
        }
        onChange={(event) => onChange({ ...filters, [key]: event.target.value || undefined })}
        placeholder={placeholder}
        type={type}
        value={filters[key] ?? ''}
      />
    </label>
  );
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        {field('from', 'Desde', 'date')}
        {field('to', 'Hasta', 'date')}
        {field('country', 'País', 'text', 'CL')}
        {field('currency', 'Moneda', 'text', 'USD')}
        {field('sellerId', 'Vendedor UUID', 'text')}
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
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Revenue Intelligence · Phase 1"
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/revenue/kpis">
              <Button variant="outline">KPIs</Button>
            </Link>
            <Link href="/revenue/funnels">
              <Button variant="outline">Funnels</Button>
            </Link>
            <Link href="/revenue/cohorts">
              <Button variant="outline">Cohortes</Button>
            </Link>
            <Link href="/revenue/forecast">
              <Button>Forecast</Button>
            </Link>
          </div>
        }
      />
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
                  <div className="h-72">
                    {chart.length ? (
                      <ResponsiveContainer height="100%" width="100%">
                        <AreaChart data={chart}>
                          <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Area
                            dataKey="revenue"
                            fill="#c7d2fe"
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
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
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
                            className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950"
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
                    <div className="h-4 rounded-full bg-slate-100 dark:bg-slate-800">
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
              <div className="h-[420px]">
                {chart.length ? (
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart data={chart}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
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
                        className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-950"
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
