'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { api } from '@/lib/api-client';
import { arrayValue, numberValue, stringValue } from '@/lib/utils';

const OPERATING_SECTIONS = [
  ['newLeads', 'Leads nuevos', '/leads', '✦'],
  ['todayFollowUps', 'Responder hoy', '/my-day?section=todayFollowUps', '◷'],
  ['paymentPromises', 'Cobros pendientes', '/collections', '$'],
  ['pendingActivations', 'Activaciones', '/activations', '✓'],
  ['renewalsToday', 'Renovaciones', '/renewals/today', '↻'],
  ['overdueRenewals', 'Renovaciones vencidas', '/renewals/overdue', '!'],
  ['lowStock', 'Stock bajo', '/catalog', '▣'],
] as const;

export function MyDayPage(): React.ReactElement {
  const data = useQuery({ queryKey: ['my-day'], queryFn: () => api.getMyDay() });
  const summary = useQuery({
    queryKey: ['my-day', 'summary'],
    queryFn: () => api.getMyDaySummary(),
  });
  return (
    <QueryState
      isError={data.isError || summary.isError}
      isLoading={data.isLoading || summary.isLoading}
      onRetry={() => void Promise.all([data.refetch(), summary.refetch()])}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Operación comercial"
          title="Mi Día"
          description="La cola de trabajo para responder, cobrar, activar y renovar."
          actions={
            <Link href="/leads">
              <Button>＋ Registrar Lead</Button>
            </Link>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {OPERATING_SECTIONS.map(([key, label, href, icon]) => (
            <Link href={href} key={key}>
              <MetricCard
                icon={icon}
                label={label}
                value={numberValue(summary.data?.[key])}
                trend="Abrir cola de trabajo"
              />
            </Link>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {OPERATING_SECTIONS.slice(0, 4).map(([key, label, href]) => {
            const rows = arrayValue<Record<string, unknown>>(data.data?.sections[key]?.data);
            return (
              <Card className="p-5" key={key}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-black text-content-primary">{label}</h2>
                  <Link className="text-xs font-bold text-brand-600" href={href}>
                    Ver todo →
                  </Link>
                </div>
                {rows.length ? (
                  <div className="mt-4 space-y-2">
                    {rows.slice(0, 4).map((row, index) => (
                      <div
                        className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle p-3"
                        key={stringValue(row.id, `${key}-${index}`)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-content-primary">
                            {stringValue(row.title) ||
                              stringValue(row.reference, 'Actividad comercial')}
                          </p>
                          <p className="mt-1 truncate text-xs text-content-muted">
                            {stringValue(row.detail) || stringValue(row.dueAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    className="mt-4 min-h-28 border-0 bg-transparent p-0"
                    description="No hay acciones pendientes."
                    title="Todo al día"
                  />
                )}
              </Card>
            );
          })}
        </div>
      </PageGrid>
    </QueryState>
  );
}
