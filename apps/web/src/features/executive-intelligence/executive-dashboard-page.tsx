'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { MetricCard } from '@/components/ui/metric-card';
import { api } from '@/lib/api-client';

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
  const summary = useQuery({
    queryKey: ['my-day', 'summary', 'dashboard'],
    queryFn: () => api.getMyDaySummary(),
    staleTime: 60_000,
  });
  const kpis = dashboard.data?.kpis;
  return (
    <QueryState
      isError={dashboard.isError || summary.isError}
      isLoading={dashboard.isLoading || summary.isLoading}
      onRetry={() => void Promise.all([dashboard.refetch(), summary.refetch()])}
    >
      {dashboard.data && kpis ? (
        <PageGrid>
          <PageHeader
            eyebrow="Operación comercial"
            title="Dashboard"
            description="Las seis señales que el equipo necesita para mover el negocio hoy."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Link href="/leads">
              <MetricCard
                icon="✦"
                label="Leads del día"
                value={summary.data?.newLeads ?? 0}
                trend="Registrar y calificar"
              />
            </Link>
            <Link href="/sales">
              <MetricCard
                icon="↗"
                label="Ventas del mes"
                value={money(kpis.salesMonth)}
                trend="Acuerdos confirmados"
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
            <Link href="/renewals">
              <MetricCard
                icon="↻"
                label="Renovaciones"
                value={kpis.renewalsMonth}
                trend={`${kpis.pendingRenewals} próximas`}
              />
            </Link>
            <Link href="/pipeline">
              <MetricCard
                icon="%"
                label="Conversión"
                value={`${kpis.conversion}%`}
                trend="Oportunidad a venta"
              />
            </Link>
            <Link href="/sales">
              <MetricCard
                icon="◉"
                label="Ingresos"
                value={money(kpis.billingMonth)}
                trend="Pagos confirmados del mes"
              />
            </Link>
          </div>
        </PageGrid>
      ) : null}
    </QueryState>
  );
}
