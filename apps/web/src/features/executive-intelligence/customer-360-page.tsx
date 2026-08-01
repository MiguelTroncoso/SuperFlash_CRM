'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { api } from '@/lib/api-client';
import type { JsonRecord } from '@/lib/types';

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function metricText(value: unknown): string {
  if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
    const metric = value[0] as JsonRecord;
    return `${text(metric.currency)} ${text(metric.amount)}`;
  }
  return text(value);
}

function customerName(contact: JsonRecord): string {
  return (
    [contact.firstName, contact.lastName]
      .filter((value) => typeof value === 'string' && value)
      .join(' ') || 'Cliente'
  );
}

export function Customer360Page({ contactId }: { readonly contactId: string }): React.ReactElement {
  const result = useQuery({
    queryKey: ['customer-360', contactId],
    queryFn: () => api.getCustomer360(contactId),
  });
  const data = result.data;
  return (
    <QueryState
      isError={result.isError}
      isLoading={result.isLoading}
      onRetry={() => void result.refetch()}
    >
      {data ? (
        <PageGrid>
          <PageHeader
            eyebrow="Customer 360"
            title={customerName(data.contact)}
            description="Contexto comercial, operativo y de relación del cliente, sin exponer secretos."
            actions={
              <Link href="/contacts">
                <Button variant="outline">Volver a contactos</Button>
              </Link>
            }
          />
          <Card>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-content-muted">Correo</p>
                <p className="mt-1 text-sm font-semibold text-content-primary">
                  {text(data.contact.email)}
                </p>
              </div>
              <div>
                <p className="text-xs text-content-muted">Teléfono</p>
                <p className="mt-1 text-sm font-semibold text-content-primary">
                  {text(data.contact.phone)}
                </p>
              </div>
              <div>
                <p className="text-xs text-content-muted">País / origen</p>
                <p className="mt-1 text-sm font-semibold text-content-primary">
                  {text(data.contact.country)} · {text(data.contact.source)}
                </p>
              </div>
              <div>
                <p className="text-xs text-content-muted">Responsable</p>
                <p className="mt-1 text-sm font-semibold text-content-primary">
                  {data.contact.assignedTo
                    ? `${text((data.contact.assignedTo as JsonRecord).firstName)} ${text((data.contact.assignedTo as JsonRecord).lastName)}`
                    : 'Sin asignar'}
                </p>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon="↗"
              label="Ventas"
              value={data.sales.length}
              trend={`${data.payments.length} pagos`}
            />
            <MetricCard
              icon="◉"
              label="MRR"
              value={metricText(data.metrics.mrr)}
              trend="Suscripciones activas"
            />
            <MetricCard
              icon="◎"
              label="LTV"
              value={metricText(data.metrics.ltv)}
              trend={`Ticket promedio ${text(data.metrics.averageTicket)}`}
            />
            <MetricCard
              icon="◷"
              label="Próxima renovación"
              value={text(data.metrics.nextRenewalAt).slice(0, 10)}
              trend={`Saldo pendiente ${text(data.metrics.pendingBalance)}`}
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Timeline unificada</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.timeline.length ? (
                  data.timeline.slice(0, 30).map((item, index) => (
                    <div
                      className="flex gap-3 border-b border-border-subtle pb-3 last:border-0"
                      key={`${text(item.id)}-${index}`}
                    >
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      <div>
                        <p className="text-sm font-semibold text-content-primary">
                          {text(item.title) !== '—'
                            ? text(item.title)
                            : text(item.text) !== '—'
                              ? text(item.text)
                              : text(item.kind)}
                        </p>
                        <p className="text-xs text-content-muted">{text(item.occurredAt)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-content-muted">Sin actividad registrada.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Relación comercial</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InfoRow label="Oportunidades" value={data.opportunities.length} />
                <InfoRow label="Suscripciones" value={data.subscriptions.length} />
                <InfoRow label="Renovaciones" value={data.renewals.length} />
                <InfoRow label="Fulfillments" value={data.fulfillments.length} />
                <InfoRow
                  label="Credenciales"
                  value={`${data.credentials.length} · siempre enmascaradas`}
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                    Etiquetas
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Array.isArray(data.contact.tags) && data.contact.tags.length ? (
                      (data.contact.tags as JsonRecord[]).map((tag) => (
                        <span
                          className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                          key={text(tag.id)}
                        >
                          {text(tag.name)}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-content-muted">Sin etiquetas</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </PageGrid>
      ) : null}
    </QueryState>
  );
}

function InfoRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | number;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle pb-2 last:border-0">
      <span className="text-sm text-content-secondary">{label}</span>
      <span className="text-sm font-bold text-content-primary">{value}</span>
    </div>
  );
}
