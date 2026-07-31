'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { PageHeader, PageGrid } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { SectionTitle } from '@/components/shared/section-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusBadge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { arrayValue, numberValue, stringValue } from '@/lib/utils';

const sections: ReadonlyArray<readonly [string, string, string]> = [
  ['overdueFollowUps', 'Seguimientos vencidos', 'rose'],
  ['todayFollowUps', 'Para hoy', 'blue'],
  ['newLeads', 'Leads nuevos', 'violet'],
  ['awaitingMoney', 'Esperando pago', 'amber'],
  ['pendingFulfillments', 'Fulfillments pendientes', 'orange'],
  ['failedFulfillments', 'Fulfillments fallidos', 'rose'],
  ['pendingActivations', 'Activaciones pendientes', 'emerald'],
  ['expiringTrials', 'Trials por vencer', 'indigo'],
  ['renewalsToday', 'Renovaciones hoy', 'blue'],
  ['urgentRenewals', 'Renovaciones urgentes', 'amber'],
  ['paymentPromises', 'Promesas de pago', 'violet'],
  ['overdueRenewals', 'Clientes vencidos', 'rose'],
  ['vipRenewals', 'Clientes prioritarios', 'emerald'],
];

export function MyDayPage(): React.ReactElement {
  const data = useQuery({ queryKey: ['my-day'], queryFn: () => api.getMyDay() });
  const summary = useQuery({
    queryKey: ['my-day', 'summary'],
    queryFn: () => api.getMyDaySummary(),
  });
  const renewalDashboard = useQuery({
    queryKey: ['renewal-dashboard', 'my-day'],
    queryFn: () => api.getRenewalDashboard(),
  });
  const retry = () => {
    void Promise.all([data.refetch(), summary.refetch(), renewalDashboard.refetch()]);
  };
  return (
    <QueryState
      isError={data.isError || summary.isError}
      isLoading={data.isLoading || summary.isLoading}
      onRetry={retry}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Operations cockpit"
          title="Mi Día"
          description="Una bandeja priorizada para que cada responsable sepa qué mover hoy."
          actions={
            <Button onClick={() => window.location.assign('/contacts')}>＋ Registrar lead</Button>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon="!"
            label="Vencidos"
            value={numberValue(summary.data?.overdueFollowUps)}
            trend="Requieren seguimiento"
          />
          <MetricCard
            icon="↻"
            label="Renovaciones próximas"
            value={renewalDashboard.data?.cards.next7Days ?? '—'}
            trend="Siguientes 7 días"
          />
          <MetricCard
            icon="$"
            label="Ingresos en riesgo"
            value={renewalDashboard.data?.cards.projectedRevenue[0]?.amount ?? '—'}
            trend="Ciclos próximos"
          />
          <MetricCard
            icon="◷"
            label="Para hoy"
            value={numberValue(summary.data?.todayFollowUps)}
            trend="Agenda comercial"
          />
          <MetricCard
            icon="⚙"
            label="Operaciones"
            value={
              numberValue(summary.data?.pendingFulfillments) +
              numberValue(summary.data?.pendingActivations)
            }
            trend="Entrega y activación"
          />
          <MetricCard
            icon="◌"
            label="Trials por vencer"
            value={numberValue(summary.data?.expiringTrials)}
            trend="Próximas 48 horas"
          />
        </div>
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {sections.map(([key, title]) => {
            const section = data.data?.sections[key];
            const rows = arrayValue<Record<string, unknown>>(section?.data);
            return (
              <Card className="p-5" key={key}>
                <SectionTitle
                  title={title}
                  detail={`${numberValue(summary.data?.[key])} elementos`}
                  action={
                    <Link
                      className="text-xs font-bold text-brand-600"
                      href={`/my-day?section=${key}`}
                    >
                      Ver →
                    </Link>
                  }
                />
                {rows.length ? (
                  <div className="space-y-2">
                    {rows.slice(0, 4).map((row, index) => {
                      const id = stringValue(row.id, `${key}-${index}`);
                      return (
                        <div
                          className="flex items-center justify-between rounded-xl border border-slate-100 p-3 dark:border-slate-800"
                          key={id}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {stringValue(row.title) ||
                                stringValue(row.reference, 'Actividad comercial')}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-400">
                              {stringValue(row.detail) || stringValue(row.dueAt)}
                            </p>
                          </div>
                          {row.status ? <StatusBadge status={stringValue(row.status)} /> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    className="min-h-32 border-0 bg-transparent p-0"
                    description="No hay elementos pendientes en esta sección."
                    title="Todo al día"
                  />
                )}
              </Card>
            );
          })}
        </div>
        <Card className="p-5">
          <SectionTitle
            title="Última sincronización"
            detail={`Datos generados ${data.data?.generatedAt ? new Date(data.data.generatedAt).toLocaleString('es-CL') : 'ahora'}`}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              ● API conectada
            </span>
            <span>Zona horaria: {data.data?.timezone}</span>
            <span>La información está filtrada por tu organización y permisos.</span>
          </div>
        </Card>
      </PageGrid>
    </QueryState>
  );
}
