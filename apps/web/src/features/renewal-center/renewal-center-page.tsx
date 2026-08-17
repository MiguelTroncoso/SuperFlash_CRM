'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { RenewalCenterDashboard, RenewalCenterItem } from '@/lib/types';

const WORKFLOW_STATUSES = [
  ['PENDING', 'Pendiente'],
  ['CONTACTED', 'Contactar'],
  ['IN_CONVERSATION', 'En conversación'],
  ['PAYMENT_PROMISE', 'Promesa de pago'],
  ['PAID', 'Pagado'],
  ['RENEWED', 'Renovado'],
  ['NOT_RENEWED', 'No renovó'],
  ['CANCELLED', 'Cancelado'],
  ['LOST', 'Perdido'],
] as const;

function money(values: Array<{ currency: string; amount: string }> | undefined): string {
  const value = values?.[0];
  return value ? `${value.currency} ${Number(value.amount).toLocaleString('es-CL')}` : '—';
}

function tabs(pathname: string): React.ReactElement {
  const links = [
    ['/renewals', 'Dashboard'],
    ['/renewals/upcoming', 'Próximas'],
    ['/renewals/today', 'Hoy'],
    ['/renewals/overdue', 'Vencidas'],
    ['/renewals/calendar', 'Calendario'],
    ['/renewals/history', 'Historial'],
    ['/renewals/reports', 'Reportes'],
    ['/renewals/import', 'Importar CSV'],
  ] as const;
  return (
    <nav
      aria-label="Centro de Renovaciones"
      className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0"
    >
      <div className="flex min-w-max gap-2">
        {links.map(([href, label]) => (
          <Link href={href} key={href}>
            <Button
              className="shrink-0"
              variant={pathname === href ? 'primary' : 'outline'}
              size="sm"
            >
              {label}
            </Button>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function RenewalFilters({
  onChange,
}: {
  readonly onChange: (query: string) => void;
}): React.ReactElement {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [country, setCountry] = useState('');
  const apply = (): void => onChange(queryString({ from, to, country }));
  return (
    <Card>
      <CardContent className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <label className="text-xs font-semibold text-content-secondary">
          Desde
          <Input
            className="mt-1"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-content-secondary">
          Hasta
          <Input
            className="mt-1"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-content-secondary">
          País
          <Select
            className="mt-1"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="CL">Chile</option>
            <option value="MX">México</option>
            <option value="PE">Perú</option>
            <option value="US">Estados Unidos</option>
          </Select>
        </label>
        <Button onClick={apply} type="button">
          Aplicar filtros
        </Button>
      </CardContent>
    </Card>
  );
}

function RenewalTable({ records }: { readonly records: RenewalCenterItem[] }): React.ReactElement {
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const workflow = useMutation({
    mutationFn: ({ id, workflowStatus }: { id: string; workflowStatus: string }) =>
      api.updateRenewalWorkflow(id, { workflowStatus }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['renewal'] });
      toast.push({ title: 'Estado actualizado', tone: 'success' });
    },
  });
  const pay = useMutation({
    mutationFn: (id: string) => api.payRenewal(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['renewal'] });
      toast.push({ title: 'Renovación registrada', tone: 'success' });
    },
  });
  if (records.length === 0)
    return (
      <EmptyState
        title="No hay renovaciones"
        description="No existen ciclos que coincidan con los filtros actuales."
      />
    );
  return (
    <div className="overflow-x-auto rounded-xl border border-border-default">
      <table className="min-w-[760px] w-full text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-content-muted">
          <tr>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Producto</th>
            <th className="px-4 py-3">Vence</th>
            <th className="px-4 py-3">Monto</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {records.map((record) => (
            <tr className="bg-surface-card" key={record.id}>
              <td className="px-4 py-3">
                <span className="font-semibold text-content-primary">
                  {record.customer.name ?? 'Sin nombre'}
                </span>
                <div className="text-xs text-content-muted">
                  {record.customer.country ?? 'Sin país'}
                </div>
              </td>
              <td className="px-4 py-3 text-content-secondary">{record.product.name}</td>
              <td className="px-4 py-3 text-content-secondary">
                {new Date(record.dueAt).toLocaleDateString('es-CL')}
              </td>
              <td className="px-4 py-3 font-semibold text-content-primary">
                {record.currency} {Number(record.amount).toLocaleString('es-CL')}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={record.workflowLabel} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Select
                    aria-label={`Estado de ${record.customer.name ?? 'renovación'}`}
                    className="w-40"
                    value={record.workflowStatus}
                    onChange={(event) =>
                      workflow.mutate({ id: record.id, workflowStatus: event.target.value })
                    }
                  >
                    {WORKFLOW_STATUSES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  {record.status !== 'PAID' && (
                    <Button
                      disabled={pay.isPending}
                      onClick={() => {
                        if (
                          window.confirm('¿Registrar esta renovación y crear su siguiente ciclo?')
                        )
                          pay.mutate(record.id);
                      }}
                      size="sm"
                      type="button"
                    >
                      Renovar
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RenewalDashboardPage(): React.ReactElement {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const dashboard = useQuery({
    queryKey: ['renewal-dashboard', query],
    queryFn: () => api.getRenewalDashboard(query),
  });
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Renewals · Lifecycle"
        title="Centro de Renovaciones"
        description="Controla vencimientos, riesgo, recuperación e historial sin automatizar el contacto."
      />
      {tabs(pathname)}
      <RenewalFilters onChange={setQuery} />
      <QueryState
        isLoading={dashboard.isLoading}
        isError={dashboard.isError}
        onRetry={() => void dashboard.refetch()}
      >
        {dashboard.data ? (
          <RenewalDashboardContent dashboard={dashboard.data} />
        ) : (
          <EmptyState
            title="Sin datos de renovación"
            description="Los ciclos aparecerán aquí cuando existan suscripciones activas."
          />
        )}
      </QueryState>
    </PageGrid>
  );
}

function RenewalDashboardContent({
  dashboard,
}: {
  readonly dashboard: RenewalCenterDashboard;
}): React.ReactElement {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon="◷" label="Renovaciones hoy" value={String(dashboard.cards.today)} />
        <MetricCard icon="7" label="Próximas 7 días" value={String(dashboard.cards.next7Days)} />
        <MetricCard icon="30" label="Próximas 30 días" value={String(dashboard.cards.next30Days)} />
        <MetricCard
          icon="!"
          label="Clientes en riesgo"
          value={String(dashboard.cards.atRiskCustomers)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon="$" label="Monto próximo" value={money(dashboard.cards.upcomingAmount)} />
        <MetricCard icon="✓" label="Monto renovado" value={money(dashboard.cards.renewedAmount)} />
        <MetricCard
          icon="↗"
          label="Ingresos proyectados"
          value={money(dashboard.cards.projectedRevenue)}
        />
        <MetricCard
          icon="%"
          label="Tasa de renovación"
          value={`${dashboard.cards.renewalRate.toFixed(2)}%`}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Renovaciones críticas</CardTitle>
          </CardHeader>
          <CardContent>
            <RenewalTable records={dashboard.critical} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Próximos ciclos</CardTitle>
          </CardHeader>
          <CardContent>
            <RenewalTable records={dashboard.upcoming} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Puente financiero</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            icon="−"
            label="Gastos del mes"
            value={money(dashboard.financial.currentExpenses)}
          />
          <MetricCard
            icon="⌁"
            label="Utilidad proyectada"
            value={money(dashboard.financial.projectedProfit)}
          />
          <MetricCard
            icon="↻"
            label="Ingresos recuperados"
            value={money(dashboard.cards.recoveredRevenue)}
          />
        </CardContent>
      </Card>
    </>
  );
}

export function RenewalListPage({
  mode,
}: {
  readonly mode: 'upcoming' | 'today' | 'overdue' | 'history';
}): React.ReactElement {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const queryResult = useQuery({
    queryKey: ['renewal', mode, query],
    queryFn: () =>
      mode === 'today'
        ? api.getRenewalsToday(query)
        : mode === 'overdue'
          ? api.getRenewalsOverdue(query)
          : mode === 'history'
            ? api.getRenewalHistory(query)
            : api.getRenewals(query),
  });
  const title =
    mode === 'upcoming'
      ? 'Próximas renovaciones'
      : mode === 'today'
        ? 'Renovaciones de hoy'
        : mode === 'overdue'
          ? 'Renovaciones vencidas'
          : 'Historial de renovaciones';
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Renewals · Lifecycle"
        title={title}
        description="Lista paginada y actualizable por responsable, cliente, producto y país."
      />
      {tabs(pathname)}
      <RenewalFilters onChange={setQuery} />
      <QueryState
        isLoading={queryResult.isLoading}
        isError={queryResult.isError}
        onRetry={() => void queryResult.refetch()}
      >
        {queryResult.data ? (
          <Card>
            <CardContent className="p-3 sm:p-4">
              <RenewalTable records={queryResult.data.data} />
              <p className="mt-3 text-xs text-content-muted">
                Página {queryResult.data.pagination.page} de{' '}
                {queryResult.data.pagination.totalPages} · {queryResult.data.pagination.total}{' '}
                ciclos
              </p>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            title="Sin renovaciones"
            description="Prueba otros filtros o registra una suscripción."
          />
        )}
      </QueryState>
    </PageGrid>
  );
}

export function RenewalCalendarPage(): React.ReactElement {
  const pathname = usePathname();
  const calendar = useQuery({
    queryKey: ['renewal-calendar'],
    queryFn: () => api.getRenewalCalendar(),
  });
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Renewals · Lifecycle"
        title="Calendario de renovaciones"
        description="Abre cada día para ver los ciclos próximos, pagados y vencidos."
      />
      {tabs(pathname)}
      <QueryState
        isLoading={calendar.isLoading}
        isError={calendar.isError}
        onRetry={() => void calendar.refetch()}
      >
        {calendar.data?.data.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {calendar.data.data.map((day) => (
              <Card key={day.date}>
                <CardHeader>
                  <CardTitle>
                    {new Date(`${day.date}T00:00:00Z`).toLocaleDateString('es-CL', {
                      dateStyle: 'full',
                    })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {day.items.map((record) => (
                    <div className="rounded-xl border border-border-subtle p-3" key={record.id}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-content-primary">
                          {record.customer.name ?? 'Sin nombre'}
                        </span>
                        <StatusBadge status={record.workflowLabel} />
                      </div>
                      <p className="mt-1 text-xs text-content-muted">
                        {record.product.name} · {record.currency} {record.amount}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="Calendario vacío" description="No hay renovaciones para mostrar." />
        )}
      </QueryState>
    </PageGrid>
  );
}

export function RenewalImportPage(): React.ReactElement {
  const pathname = usePathname();
  const [csv, setCsv] = useState('');
  const toast = useToastStore();
  const preview = useMutation({ mutationFn: () => api.previewRenewalImport(csv) });
  const commit = useMutation({
    mutationFn: () => api.importRenewals(csv),
    onSuccess: () => toast.push({ title: 'Importación completada', tone: 'success' }),
  });
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Renewals · Lifecycle"
        title="Importar renovaciones"
        description="Carga ciclos históricos con vista previa, validación de duplicados y auditoría."
      />
      {tabs(pathname)}
      <Card>
        <CardContent className="space-y-4 p-4">
          <label className="text-xs font-semibold text-content-secondary">
            CSV
            <Input
              accept=".csv,text/csv"
              className="mt-2"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.text().then(setCsv);
              }}
            />
          </label>
          <p className="text-xs text-content-muted">
            Encabezados: Cliente, Producto, Fecha inicio, Fecha vencimiento, Monto, Moneda, Estado,
            Notas.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!csv || preview.isPending}
              onClick={() => preview.mutate()}
              type="button"
            >
              Vista previa
            </Button>
            <Button
              disabled={!csv || commit.isPending || !preview.data}
              onClick={() => {
                if (window.confirm('¿Importar las filas válidas?')) commit.mutate();
              }}
              type="button"
            >
              Importar válidas
            </Button>
          </div>
          {preview.data ? (
            <pre className="max-h-96 overflow-auto rounded-xl bg-surface-muted p-3 text-xs text-content-secondary">
              {JSON.stringify(preview.data, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </PageGrid>
  );
}

export function RenewalReportsPage(): React.ReactElement {
  const pathname = usePathname();
  const [groupBy, setGroupBy] = useState('month');
  const report = useQuery({
    queryKey: ['renewal-report', groupBy],
    queryFn: () => api.getRenewalReport(queryString({ groupBy })),
  });
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Renewals · Lifecycle"
        title="Reportes de renovación"
        description="Compara recuperación y pérdida por período, producto, país, vendedor o cliente."
      />
      {tabs(pathname)}
      <Card>
        <CardContent className="p-4">
          <label className="text-xs font-semibold text-content-secondary">
            Agrupar por
            <Select
              className="mt-1 max-w-sm"
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value)}
            >
              <option value="month">Mes</option>
              <option value="quarter">Trimestre</option>
              <option value="year">Año</option>
              <option value="product">Producto</option>
              <option value="country">País</option>
              <option value="seller">Responsable</option>
              <option value="customer">Cliente</option>
            </Select>
          </label>
        </CardContent>
      </Card>
      <QueryState
        isLoading={report.isLoading}
        isError={report.isError}
        onRetry={() => void report.refetch()}
      >
        {report.data?.data.length ? (
          <Card>
            <CardContent className="overflow-x-auto p-3 sm:p-4">
              <table className="min-w-[620px] w-full text-left text-sm">
                <thead className="text-xs uppercase text-content-muted">
                  <tr>
                    <th className="px-3 py-2">Grupo</th>
                    <th className="px-3 py-2">Moneda</th>
                    <th className="px-3 py-2">Monto</th>
                    <th className="px-3 py-2">Ciclos</th>
                    <th className="px-3 py-2">Pagadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {report.data.data.map((row) => (
                    <tr key={`${row.label}-${row.currency}`}>
                      <td className="px-3 py-2 text-content-primary">{row.label}</td>
                      <td className="px-3 py-2 text-content-secondary">{row.currency}</td>
                      <td className="px-3 py-2 font-semibold text-content-primary">{row.amount}</td>
                      <td className="px-3 py-2 text-content-secondary">{row.count}</td>
                      <td className="px-3 py-2 text-content-secondary">{row.paid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            title="Sin datos para reportar"
            description="Los reportes se calculan sobre los ciclos existentes."
          />
        )}
      </QueryState>
    </PageGrid>
  );
}
