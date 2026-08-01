'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';

const labels: Record<string, string> = {
  followUps: 'Seguimientos',
  paymentPromises: 'Promesas de pago',
  renewals: 'Renovaciones',
  pendingSales: 'Ventas pendientes',
  pendingPayments: 'Pagos pendientes',
  fulfillments: 'Fulfillments',
  activations: 'Activaciones',
  trials: 'Trials por vencer',
  inactiveCustomers: 'Clientes inactivos',
};

export function OperationalAgendaPage(): React.ReactElement {
  const agenda = useQuery({
    queryKey: ['operational-agenda'],
    queryFn: api.getOperationalAgenda,
    staleTime: 30_000,
  });
  return (
    <QueryState
      isError={agenda.isError}
      isLoading={agenda.isLoading}
      onRetry={() => void agenda.refetch()}
    >
      {agenda.data ? (
        <PageGrid>
          <PageHeader
            eyebrow="Workspace operativo"
            title="Agenda operativa"
            description="Una cola priorizada de acciones que requieren atención comercial u operativa."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(agenda.data.sections).map(([key, items]) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle>{labels[key] ?? key}</CardTitle>
                  <span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-bold text-content-secondary">
                    {items.length}
                  </span>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.length ? (
                    items.slice(0, 10).map((item) => (
                      <Link
                        className="block rounded-xl border border-border-subtle p-3 transition hover:border-brand-300 hover:bg-surface-muted"
                        href={item.href}
                        key={item.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-content-primary">
                            {item.title}
                          </p>
                          <span className="shrink-0 text-[10px] text-content-muted">
                            {item.dueAt?.slice(0, 10) ?? '—'}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-content-secondary">
                          {item.detail}
                        </p>
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm text-content-muted">Sin pendientes.</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </PageGrid>
      ) : null}
    </QueryState>
  );
}
