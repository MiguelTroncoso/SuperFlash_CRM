'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

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
  const contacts = useQuery({
    queryKey: ['contacts', 'executive-count'],
    queryFn: () => api.getContacts('?page=1&limit=1'),
    staleTime: 60_000,
  });
  const products = useQuery({
    queryKey: ['catalog-products', 'executive-count'],
    queryFn: () => api.getProducts('?page=1&limit=1&active=true'),
    staleTime: 60_000,
  });
  const kpis = dashboard.data?.kpis;
  const today = operations.data?.today;
  return (
    <QueryState
      isError={
        dashboard.isError ||
        operations.isError ||
        financial.isError ||
        contacts.isError ||
        products.isError
      }
      isLoading={
        dashboard.isLoading ||
        operations.isLoading ||
        financial.isLoading ||
        contacts.isLoading ||
        products.isLoading
      }
      onRetry={() =>
        void Promise.all([
          dashboard.refetch(),
          operations.refetch(),
          financial.refetch(),
          contacts.refetch(),
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
            <Link href="/contacts">
              <MetricCard
                icon="◎"
                label="Clientes"
                value={contacts.data?.pagination.total ?? 0}
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
            <Link href="/business-intelligence/funnels">
              <MetricCard
                icon="%"
                label="Conversión"
                value={`${kpis.conversion}%`}
                trend="Oportunidad a venta"
              />
            </Link>
          </div>
        </PageGrid>
      ) : null}
    </QueryState>
  );
}
