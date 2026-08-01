'use client';

import Link from 'next/link';
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

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { api } from '@/lib/api-client';
import type { IntelligenceMoneyMetric } from '@/lib/types';

const tooltipStyle = {
  backgroundColor: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 12,
  color: 'var(--content-primary)',
};

function money(items: IntelligenceMoneyMetric[]): string {
  const item = items[0];
  return item
    ? `${item.currency} ${Number(item.amount).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`
    : '—';
}

export function ExecutiveDashboardPage(): React.ReactElement {
  const dashboard = useQuery({
    queryKey: ['executive-dashboard'],
    queryFn: () => api.getExecutiveDashboard(),
    staleTime: 60_000,
  });
  const kpis = dashboard.data?.kpis;
  return (
    <QueryState
      isError={dashboard.isError}
      isLoading={dashboard.isLoading}
      onRetry={() => void dashboard.refetch()}
    >
      {dashboard.data ? (
        <PageGrid>
          <PageHeader
            eyebrow="Executive Intelligence · Phase 1"
            title="Dashboard ejecutivo"
            description="Indicadores reales de ventas, clientes, renovaciones y operación en una sola vista."
            actions={
              <>
                <Link href="/business-intelligence">
                  <Button variant="outline">Business Intelligence</Button>
                </Link>
                <Link href="/agenda">
                  <Button>Ver agenda operativa</Button>
                </Link>
              </>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon="↗"
              label="Ventas del mes"
              value={money(kpis?.salesMonth ?? [])}
              trend="Ventas confirmadas"
            />
            <MetricCard
              icon="◉"
              label="MRR"
              value={money(kpis?.mrr ?? [])}
              trend={`ARR ${money(kpis?.arr ?? [])}`}
            />
            <MetricCard
              icon="◎"
              label="Clientes activos"
              value={kpis?.activeCustomers ?? 0}
              trend={`+${kpis?.newCustomers ?? 0} este mes`}
            />
            <MetricCard
              icon="⚙"
              label="Pendientes operativos"
              value={(kpis?.pendingFulfillments ?? 0) + (kpis?.pendingActivations ?? 0)}
              trend={`${kpis?.pendingRenewals ?? 0} renovaciones próximas`}
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Ingresos por día</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72 min-w-0">
                  {dashboard.data.charts.revenueDaily.length ? (
                    <ResponsiveContainer height="100%" width="100%">
                      <AreaChart data={dashboard.data.charts.revenueDaily}>
                        <defs>
                          <linearGradient id="executive-revenue" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="var(--border-subtle)"
                          strokeDasharray="4 4"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Area
                          dataKey="revenue"
                          fill="url(#executive-revenue)"
                          stroke="#6366f1"
                          strokeWidth={3}
                          type="monotone"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-content-muted">
                      Sin ventas en el período.
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
                <div className="h-72 min-w-0">
                  {dashboard.data.charts.funnel.length ? (
                    <ResponsiveContainer height="100%" width="100%">
                      <BarChart
                        data={dashboard.data.charts.funnel}
                        layout="vertical"
                        margin={{ left: 20, right: 8 }}
                      >
                        <CartesianGrid
                          stroke="var(--border-subtle)"
                          strokeDasharray="4 4"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                        />
                        <YAxis
                          dataKey="stage"
                          type="category"
                          width={90}
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="count" fill="#14b8a6" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-content-muted">
                      Sin oportunidades en el período.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownCard
              title="Ventas por país"
              rows={dashboard.data.charts.salesCountry.map((row) => ({
                label: row.country,
                value: `${row.currency} ${row.revenue}`,
                detail: `${row.sales} ventas`,
              }))}
            />
            <BreakdownCard
              title="Ventas por producto"
              rows={dashboard.data.charts.salesProduct.map((row) => ({
                label: row.product,
                value: `${row.currency} ${row.revenue}`,
                detail: `${row.units} unidades`,
              }))}
            />
            <BreakdownCard
              title="Salud de renovaciones"
              rows={dashboard.data.charts.renewalsTrend
                .slice(-6)
                .map((row) => ({ label: row.month, value: String(row.count), detail: row.status }))}
            />
          </div>
        </PageGrid>
      ) : null}
    </QueryState>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: Array<{ label: string; value: string; detail: string }>;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length ? (
          rows.slice(0, 6).map((row) => (
            <div
              className="flex items-center justify-between gap-3"
              key={`${row.label}-${row.detail}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-content-primary">{row.label}</p>
                <p className="text-xs text-content-muted">{row.detail}</p>
              </div>
              <span className="shrink-0 text-sm font-bold text-content-primary">{row.value}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-content-muted">Sin datos disponibles.</p>
        )}
      </CardContent>
    </Card>
  );
}
