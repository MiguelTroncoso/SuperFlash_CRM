'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { api } from '@/lib/api-client';
import type { JsonRecord } from '@/lib/types';

type CustomerTab = 'summary' | 'conversation' | 'followUps' | 'sales' | 'payments' | 'renewals';

const TABS: Array<[CustomerTab, string]> = [
  ['summary', 'Resumen'],
  ['conversation', 'Conversación'],
  ['followUps', 'Seguimientos'],
  ['sales', 'Ventas'],
  ['payments', 'Pagos'],
  ['renewals', 'Renovaciones'],
];

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

function RecordList({
  records,
  empty,
}: {
  readonly records: JsonRecord[];
  readonly empty: string;
}): React.ReactElement {
  if (!records.length) return <EmptyState description={empty} title="Sin registros" />;
  return (
    <div className="space-y-2">
      {records.slice(0, 30).map((record, index) => (
        <div
          className="rounded-xl border border-border-subtle p-3"
          key={text(record.id) !== '—' ? text(record.id) : index}
        >
          <p className="text-sm font-semibold text-content-primary">
            {text(record.title) !== '—'
              ? text(record.title)
              : text(record.name) !== '—'
                ? text(record.name)
                : text(record.productNameSnapshot) !== '—'
                  ? text(record.productNameSnapshot)
                  : text(record.status)}
          </p>
          <p className="mt-1 text-xs text-content-muted">
            {text(record.dueAt) !== '—'
              ? text(record.dueAt)
              : text(record.currentPeriodEnd) !== '—'
                ? `Vence ${text(record.currentPeriodEnd)}`
                : text(record.createdAt)}
            {text(record.amount) !== '—'
              ? ` · ${text(record.currency)} ${text(record.amount)}`
              : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

export function Customer360Page({ contactId }: { readonly contactId: string }): React.ReactElement {
  const [tab, setTab] = useState<CustomerTab>('summary');
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
            description="Resumen comercial del cliente para decidir la siguiente acción."
            actions={
              <div className="flex flex-wrap gap-2">
                <Link href={`/sales?contactId=${encodeURIComponent(contactId)}`}>
                  <Button>Nueva venta</Button>
                </Link>
                <Link href="/contacts">
                  <Button variant="outline">Volver a contactos</Button>
                </Link>
              </div>
            }
          />
          <Card>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <InfoRow label="Correo" value={text(data.contact.email)} />
              <InfoRow label="Teléfono" value={text(data.contact.phone)} />
              <InfoRow
                label="País / origen"
                value={`${text(data.contact.country)} · ${text(data.contact.source)}`}
              />
              <InfoRow
                label="Responsable"
                value={
                  data.contact.assignedTo
                    ? `${text((data.contact.assignedTo as JsonRecord).firstName)} ${text((data.contact.assignedTo as JsonRecord).lastName)}`
                    : 'Sin asignar'
                }
              />
            </CardContent>
          </Card>
          <nav
            aria-label="Customer 360"
            className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0"
          >
            <div className="flex min-w-max gap-2">
              {TABS.map(([value, label]) => (
                <Button
                  key={value}
                  onClick={() => setTab(value)}
                  size="sm"
                  variant={tab === value ? 'primary' : 'outline'}
                >
                  {label}
                </Button>
              ))}
            </div>
          </nav>
          {tab === 'summary' ? (
            <>
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
                  icon="↻"
                  label="Próxima renovación"
                  value={text(data.metrics.nextRenewalAt).slice(0, 10)}
                  trend={`Saldo ${text(data.metrics.pendingBalance)}`}
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Interés comercial</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.opportunities.length ? (
                    data.opportunities.slice(0, 10).map((item) => {
                      const opportunity = item as JsonRecord;
                      const product = opportunity.product as JsonRecord | null | undefined;
                      const category = opportunity.category as JsonRecord | null | undefined;
                      const pipelineStage = opportunity.pipelineStage as
                        JsonRecord | null | undefined;
                      const nextFollowUp = opportunity.nextFollowUp as
                        JsonRecord | null | undefined;
                      return (
                        <div
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle p-3"
                          key={text(opportunity.id)}
                        >
                          <div>
                            <p className="text-sm font-bold text-content-primary">
                              {text(opportunity.title)}
                            </p>
                            <p className="mt-1 text-xs text-content-secondary">
                              {text(pipelineStage?.name)} · {text(product?.name ?? category?.name)}
                            </p>
                            <p className="mt-1 text-xs text-content-muted">
                              Seguimiento: {text(nextFollowUp?.dueAt)} · Compra estimada:{' '}
                              {text(opportunity.estimatedPurchaseAt)}
                            </p>
                          </div>
                          <Link href="/pipeline">
                            <Button size="sm" variant="outline">
                              Ver pipeline
                            </Button>
                          </Link>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-content-muted">Sin oportunidades registradas.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Suscripciones activas y próximas</CardTitle>
                </CardHeader>
                <CardContent>
                  <RecordList
                    empty="No hay suscripciones registradas."
                    records={data.subscriptions}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}
          {tab === 'conversation' ? (
            <Card>
              <CardHeader>
                <CardTitle>Conversación y actividad</CardTitle>
              </CardHeader>
              <CardContent>
                <RecordList
                  empty="No hay conversación registrada."
                  records={data.conversations.length ? data.conversations : data.timeline}
                />
              </CardContent>
            </Card>
          ) : null}
          {tab === 'followUps' ? (
            <Card>
              <CardHeader>
                <CardTitle>Seguimientos</CardTitle>
              </CardHeader>
              <CardContent>
                <RecordList empty="No hay seguimientos pendientes." records={data.followUps} />
              </CardContent>
            </Card>
          ) : null}
          {tab === 'sales' ? (
            <Card>
              <CardHeader>
                <CardTitle>Ventas</CardTitle>
              </CardHeader>
              <CardContent>
                <RecordList empty="No hay ventas registradas." records={data.sales} />
              </CardContent>
            </Card>
          ) : null}
          {tab === 'payments' ? (
            <Card>
              <CardHeader>
                <CardTitle>Pagos</CardTitle>
              </CardHeader>
              <CardContent>
                <RecordList empty="No hay pagos registrados." records={data.payments} />
              </CardContent>
            </Card>
          ) : null}
          {tab === 'renewals' ? (
            <Card>
              <CardHeader>
                <CardTitle>Renovaciones</CardTitle>
              </CardHeader>
              <CardContent>
                <RecordList empty="No hay renovaciones registradas." records={data.renewals} />
              </CardContent>
            </Card>
          ) : null}
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
  readonly value: string;
}): React.ReactElement {
  return (
    <div>
      <p className="text-xs text-content-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-content-primary">{value}</p>
    </div>
  );
}
