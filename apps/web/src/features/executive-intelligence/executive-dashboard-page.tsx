'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { MetricCard } from '@/components/ui/metric-card';
import { api } from '@/lib/api-client';
import type { FinancialDashboard, OperationalDashboard } from '@/lib/types';

function money(items: Array<{ currency: string; amount: string }>): string {
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
  const operations = useQuery<OperationalDashboard>({
    queryKey: ['operational-dashboard', 'executive'],
    queryFn: () => api.getOperationalDashboard(),
    staleTime: 30_000,
  });
  const financial = useQuery<FinancialDashboard>({
    queryKey: ['financial-dashboard', 'executive'],
    queryFn: () => api.getFinancialDashboard(),
    staleTime: 30_000,
  });
  const products = useQuery({
    queryKey: ['catalog-products', 'executive-count'],
    queryFn: () => api.getProducts('?page=1&limit=1&active=true'),
    staleTime: 60_000,
  });
  const kpis = dashboard.data?.kpis;
  const today = operations.data?.today;
  const paymentMethods = dashboard.data?.charts.paymentMethods ?? [];
  return (
    <QueryState
      isError={dashboard.isError || operations.isError || financial.isError || products.isError}
      isLoading={
        dashboard.isLoading || operations.isLoading || financial.isLoading || products.isLoading
      }
      onRetry={() =>
        void Promise.all([
          dashboard.refetch(),
          operations.refetch(),
          financial.refetch(),
          products.refetch(),
        ])
      }
    >
      {dashboard.data && kpis && operations.data && financial.data ? (
        <PageGrid>
          <PageHeader
            eyebrow="Operación comercial"
            title="Dashboard"
            description="Indicadores reales de ventas, caja, clientes y operación, actualizados desde la base de datos."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Link href="/sales">
              <MetricCard
                icon="↗"
                label="Ventas hoy"
                value={String(today?.sales ?? 0)}
                trend="Ventas confirmadas"
              />
            </Link>
            <Link href="/sales">
              <MetricCard
                icon="↗"
                label="Ventas del mes"
                value={String(operations.data.month.sales)}
                trend={money(kpis.salesMonth)}
              />
            </Link>
            <Link href="/collections">
              <MetricCard
                icon="$"
                label="Ingresos hoy"
                value={money(kpis.billingToday)}
                trend="Pagos netos confirmados"
              />
            </Link>
            <Link href="/collections">
              <MetricCard
                icon="$"
                label="Ingresos del mes"
                value={money(kpis.billingMonth)}
                trend="Pagos netos confirmados"
              />
            </Link>
            <Link href="/financial">
              <MetricCard
                icon="✓"
                label="Ingreso real"
                value={money([
                  { currency: financial.data.currency ?? '—', amount: financial.data.realIncome },
                ])}
                trend="Después de comisiones y reembolsos"
              />
            </Link>
            <Link href="/collections">
              <MetricCard
                icon="$"
                label="Cobros pendientes"
                value={money(kpis.pendingBalance)}
                trend="Saldos por cobrar"
              />
            </Link>
            <Link href="/financial">
              <MetricCard
                icon="✓"
                label="Utilidad neta"
                value={money([
                  { currency: financial.data.currency ?? '—', amount: financial.data.netProfit },
                ])}
                trend={`${financial.data.marginPercent.toFixed(2)}% margen`}
              />
            </Link>
            <Link href="/financial/expenses">
              <MetricCard
                icon="−"
                label="Egresos del mes"
                value={money([
                  { currency: financial.data.currency ?? '—', amount: financial.data.expenses },
                ])}
                trend="Gastos registrados"
              />
            </Link>
            <Link href="/renewals">
              <MetricCard
                icon="↻"
                label="Renovaciones"
                value={kpis.renewalsMonth}
                trend={`${kpis.pendingRenewals} próximas`}
              />
            </Link>
            <Link href="/operations">
              <MetricCard
                icon="▣"
                label="Stock crítico"
                value={operations.data.criticalStock}
                trend="Productos bajo mínimo"
              />
            </Link>
            <Link href="/sales">
              <MetricCard
                icon="◎"
                label="Clientes activos"
                value={kpis.activeCustomers}
                trend={`${kpis.activeCustomers} activos`}
              />
            </Link>
            <Link href="/catalog">
              <MetricCard
                icon="▦"
                label="Productos"
                value={products.data?.pagination.total ?? 0}
                trend="Catálogo activo"
              />
            </Link>
            <Link href="/operations">
              <MetricCard
                icon="◷"
                label="Conversaciones hoy"
                value={today?.conversations ?? 0}
                trend={`${today?.demos ?? 0} demos`}
              />
            </Link>
            <Link href="/operations">
              <MetricCard
                icon="⚡"
                label="Activaciones pendientes"
                value={kpis.pendingActivations}
                trend="Entrega operativa"
              />
            </Link>
            <Link href="/renewals">
              <MetricCard
                icon="↻"
                label="Renovaciones próximas"
                value={kpis.pendingRenewals}
                trend={`${kpis.renewalsMonth} pagadas este mes`}
              />
            </Link>
            <Link href="/business-intelligence/funnels">
              <MetricCard
                icon="%"
                label="Conversión"
                value={`${kpis.conversion}%`}
                trend="Oportunidad a venta"
              />
            </Link>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Ventas e ingresos · últimos 30 días">
              <ResponsiveContainer height={260} width="100%">
                <LineChart
                  data={dashboard.data.charts.revenueDaily.map((row) => ({
                    ...row,
                    value: Number(row.revenue),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    dataKey="value"
                    dot={false}
                    name="Ingresos"
                    stroke="#2563eb"
                    strokeWidth={3}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Ventas por país">
              <ResponsiveContainer height={260} width="100%">
                <BarChart
                  data={dashboard.data.charts.salesCountry.map((row) => ({
                    ...row,
                    value: Number(row.revenue),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" />
                  <XAxis dataKey="country" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0ea5e9" name="Ventas" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Productos más vendidos">
              <ResponsiveContainer height={260} width="100%">
                <BarChart
                  data={dashboard.data.charts.salesProduct
                    .slice(0, 8)
                    .map((row) => ({ ...row, value: Number(row.revenue) }))}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="product" type="category" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8b5cf6" name="Ingresos" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Renovaciones por periodo">
              <ResponsiveContainer height={260} width="100%">
                <BarChart
                  data={dashboard.data.charts.renewalsTrend.map((row) => ({
                    ...row,
                    value: row.count,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#22c55e" name="Renovaciones" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Ingreso real por medio de pago">
              <ResponsiveContainer height={260} width="100%">
                <BarChart
                  data={paymentMethods.map((row) => ({
                    ...row,
                    value: Number(row.amount),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" />
                  <XAxis dataKey="method" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#f97316" name="Ingreso real" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </PageGrid>
      ) : null}
    </QueryState>
  );
}

function ChartCard({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 text-sm font-bold text-content-primary">{title}</h2>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
