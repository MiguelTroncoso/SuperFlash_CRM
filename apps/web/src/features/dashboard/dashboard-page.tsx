'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ColumnDef } from '@tanstack/react-table';

import { PageHeader, PageGrid } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusBadge } from '@/components/ui/badge';
import { api, queryString } from '@/lib/api-client';
import type { Sale } from '@/lib/types';
import { numberValue } from '@/lib/utils';

const saleColumns: ColumnDef<Sale, unknown>[] = [
  {
    accessorKey: 'id',
    header: 'Venta',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-slate-400">#{row.original.id.slice(0, 8)}</span>
    ),
  },
  {
    accessorKey: 'contact.name',
    header: 'Cliente',
    cell: ({ row }) => (
      <span className="font-semibold text-slate-800 dark:text-slate-100">
        {row.original.contact?.name ?? 'Sin contacto'}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Estado',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'total',
    header: 'Total',
    cell: ({ row }) => (
      <span className="font-bold">
        {row.original.currency} {row.original.total}
      </span>
    ),
  },
];
const priorities: ReadonlyArray<readonly [string, string, string]> = [
  ['Seguimientos vencidos', 'overdueFollowUps', 'bg-rose-500'],
  ['Leads nuevos', 'newLeads', 'bg-blue-500'],
  ['Fulfillments pendientes', 'pendingFulfillments', 'bg-amber-500'],
  ['Activaciones pendientes', 'pendingActivations', 'bg-violet-500'],
];

export function DashboardPage(): React.ReactElement {
  const summary = useQuery({
    queryKey: ['my-day', 'summary'],
    queryFn: () => api.getMyDaySummary(),
  });
  const pipeline = useQuery({
    queryKey: ['pipeline', 'summary'],
    queryFn: () => api.getPipelineSummary(),
  });
  const sales = useQuery({
    queryKey: ['sales', 'recent'],
    queryFn: () =>
      api.getSales(queryString({ page: 1, limit: 6, sortBy: 'createdAt', sortOrder: 'desc' })),
  });
  const contacts = useQuery({
    queryKey: ['contacts', 'recent'],
    queryFn: () => api.getContacts(queryString({ page: 1, limit: 1 })),
  });
  const isLoading =
    summary.isLoading || pipeline.isLoading || sales.isLoading || contacts.isLoading;
  const isError = summary.isError || pipeline.isError || sales.isError || contacts.isError;
  const chartData = useMemo(() => {
    const records = sales.data?.data ?? [];
    return records
      .slice()
      .reverse()
      .map((sale, index) => ({ name: `Venta ${index + 1}`, value: numberValue(sale.total) }));
  }, [sales.data]);
  const pipelineTotal =
    (
      pipeline.data?.totalsByCurrency as
        { currency: string; amount: string; count: number }[] | undefined
    )?.reduce((total, item) => total + item.count, 0) ?? 0;
  const summaryValue = (key: string): number => numberValue(summary.data?.[key]);
  const retry = () => {
    void Promise.all([summary.refetch(), pipeline.refetch(), sales.refetch(), contacts.refetch()]);
  };
  return (
    <QueryState isError={isError} isLoading={isLoading} onRetry={retry}>
      <PageGrid>
        <PageHeader
          eyebrow="Command center"
          title="Dashboard"
          description="Una visión ejecutiva de la actividad comercial y operativa de tu organización."
          actions={
            <>
              <Button onClick={() => window.location.assign('/contacts')} variant="outline">
                ＋ Nuevo contacto
              </Button>
              <Button onClick={() => window.location.assign('/pipeline')}>Ver pipeline →</Button>
            </>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon="◎"
            label="Contactos"
            value={contacts.data?.pagination.total ?? 0}
            trend="Base activa del workspace"
          />
          <MetricCard
            icon="◇"
            label="Oportunidades abiertas"
            value={
              summaryValue('newLeads') +
                summaryValue('awaitingCreditUsage') +
                summaryValue('awaitingMoney') +
                summaryValue('potentialBuyers') || pipelineTotal
            }
            trend="Pipeline en movimiento"
          />
          <MetricCard
            icon="↗"
            label="Ventas recientes"
            value={sales.data?.pagination.total ?? 0}
            trend="Acuerdos registrados"
          />
          <MetricCard
            icon="⚙"
            label="Tareas operativas"
            value={
              summaryValue('pendingFulfillments') +
              summaryValue('failedFulfillments') +
              summaryValue('pendingActivations')
            }
            trend="Requieren atención"
          />
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Actividad de ventas</CardTitle>
                <p className="mt-1 text-xs text-slate-500">
                  Evolución de los últimos acuerdos consultados.
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                LIVE DATA
              </span>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {chartData.length ? (
                  <ResponsiveContainer height="100%" width="100%">
                    <AreaChart data={chartData} margin={{ left: -22, right: 10, top: 10 }}>
                      <defs>
                        <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                      <XAxis
                        axisLine={false}
                        dataKey="name"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        tickLine={false}
                      />
                      <YAxis
                        axisLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #e2e8f0',
                          fontSize: 12,
                        }}
                      />
                      <Area
                        dataKey="value"
                        fill="url(#salesGradient)"
                        stroke="#6366f1"
                        strokeWidth={3}
                        type="monotone"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    Aún no hay suficientes ventas para graficar.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Prioridades de Mi Día</CardTitle>
                <p className="mt-1 text-xs text-slate-500">Lo que está esperando una acción.</p>
              </div>
              <Link className="text-xs font-bold text-brand-600" href="/my-day">
                Ver todo
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {priorities.map(([label, key, color]) => (
                  <Link
                    className="flex items-center justify-between rounded-xl border border-slate-100 p-3 transition hover:border-brand-200 hover:bg-brand-50/30 dark:border-slate-800 dark:hover:border-brand-500/30"
                    href="/my-day"
                    key={key}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-2 w-2 rounded-full ${color}`} />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {label}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-slate-950 dark:text-white">
                      {summaryValue(key)}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Ventas recientes</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Últimos acuerdos del workspace.</p>
            </div>
            <Link className="text-xs font-bold text-brand-600" href="/sales">
              Abrir ventas →
            </Link>
          </CardHeader>
          <DataTable
            columns={saleColumns}
            data={sales.data?.data ?? []}
            emptyDescription="Las ventas confirmadas aparecerán aquí."
            emptyTitle="Aún no hay ventas"
          />
        </Card>
      </PageGrid>
    </QueryState>
  );
}
