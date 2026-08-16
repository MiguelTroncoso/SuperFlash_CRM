'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';

import { PageHeader, PageGrid } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { Pagination } from '@/components/ui/pagination';
import { SearchBar } from '@/components/ui/search-bar';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { NewSaleDrawer } from '@/features/sales/new-sale-drawer';
import { api, queryString } from '@/lib/api-client';
import type { Sale } from '@/lib/types';

function formatDate(value: string | null | undefined): string {
  return value
    ? new Date(value).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })
    : '—';
}

function formatSubscriptionDuration(days: number | null): string {
  if (days === 30) return '30 días';
  if (days === 90) return '3 meses';
  if (days === 180) return '6 meses';
  if (days === 365) return '12 meses';
  return 'Según ciclo';
}

export function SalesPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Sale | null>(null);
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const sales = useQuery({
    queryKey: ['sales', page, search],
    queryFn: () => api.getSales(queryString({ page, limit: 25, search })),
  });
  const confirm = async (): Promise<void> => {
    if (!selected) return;
    setConfirming(true);
    try {
      const updated = await api.confirmSale(selected.id);
      setSelected(updated);
      await queryClient.invalidateQueries({ queryKey: ['sales'] });
    } catch (error: unknown) {
      useToastStore.getState().push({
        title: 'No fue posible confirmar',
        description: error instanceof Error ? error.message : 'Error inesperado.',
        tone: 'error',
      });
    } finally {
      setConfirming(false);
    }
  };
  const columns: ColumnDef<Sale, unknown>[] = [
    {
      accessorKey: 'id',
      header: 'Venta',
      cell: ({ row }) => (
        <button
          className="font-mono text-xs font-bold text-brand-600"
          onClick={() => setSelected(row.original)}
          type="button"
        >
          #{row.original.id.slice(0, 8)}
        </button>
      ),
    },
    {
      accessorKey: 'contact',
      header: 'Cliente',
      cell: ({ row }) => (
        <span className="font-semibold">{row.original.contact?.name ?? 'Sin contacto'}</span>
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
    {
      accessorKey: 'createdAt',
      header: 'Creada',
      cell: ({ row }) => (
        <span className="text-xs text-slate-400">
          {new Date(row.original.createdAt).toLocaleDateString('es-CL')}
        </span>
      ),
    },
  ];
  return (
    <QueryState
      isError={sales.isError}
      isLoading={sales.isLoading}
      onRetry={() => void sales.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Commercial core"
          title="Ventas"
          description="Crea la venta, registra el pago y deja el saldo claro en un solo drawer."
          actions={
            <Button className="px-6 py-3 text-base" onClick={() => setNewSaleOpen(true)} size="lg">
              ＋ Nueva Venta
            </Button>
          }
        />
        <SearchBar
          className="max-w-sm"
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder="Buscar por cliente o referencia"
          value={search}
        />
        <Card>
          <DataTable
            columns={columns}
            data={sales.data?.data ?? []}
            emptyDescription="Las ventas creadas desde oportunidades aparecerán en este listado."
            emptyTitle="No hay ventas"
            virtualize
          />
          <Pagination
            onPageChange={setPage}
            page={page}
            totalPages={sales.data?.pagination.totalPages ?? 1}
          />
        </Card>
        <Drawer
          description="Detalle de la venta y su snapshot comercial."
          onClose={() => setSelected(null)}
          open={Boolean(selected)}
          title={selected ? `Venta #${selected.id.slice(0, 8)}` : 'Venta'}
        >
          {selected ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface-inset p-4">
                  <p className="text-xs text-slate-400">Estado</p>
                  <div className="mt-2">
                    <StatusBadge status={selected.status} />
                  </div>
                </div>
                <div className="rounded-xl bg-surface-inset p-4">
                  <p className="text-xs text-slate-400">Total</p>
                  <p className="mt-2 text-lg font-bold">
                    {selected.currency} {selected.total}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Cliente</p>
                <p className="mt-2 text-sm font-semibold">
                  {selected.contact?.name ?? 'Sin contacto'}
                </p>
              </div>
              {(selected.subscriptions ?? []).length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Suscripciones
                  </p>
                  {(selected.subscriptions ?? []).map((subscription) => (
                    <div
                      className="rounded-xl border border-border-subtle bg-surface-muted p-4 text-sm"
                      key={subscription.id}
                    >
                      <p className="font-semibold text-content-primary">
                        {subscription.productName}
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <dt className="text-content-muted">Duración</dt>
                          <dd className="mt-1 font-semibold text-content-primary">
                            {formatSubscriptionDuration(subscription.durationDays)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-content-muted">Inicio</dt>
                          <dd className="mt-1 font-semibold text-content-primary">
                            {formatDate(subscription.startsAt)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-content-muted">Vencimiento</dt>
                          <dd className="mt-1 font-semibold text-content-primary">
                            {formatDate(subscription.currentPeriodEnd)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-content-muted">Próxima renovación</dt>
                          <dd className="mt-1 font-semibold text-content-primary">
                            {formatDate(subscription.renewal?.dueAt ?? subscription.nextBillingAt)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              ) : null}
              {selected.status === 'DRAFT' ? (
                <Button disabled={confirming} onClick={() => void confirm()}>
                  {confirming ? 'Confirmando…' : 'Confirmar venta'}
                </Button>
              ) : null}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Notas</p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  La información detallada se mantiene en el backend y se muestra sin exponer datos
                  internos.
                </p>
              </div>
            </div>
          ) : null}
        </Drawer>
      </PageGrid>
      <NewSaleDrawer
        defaultContactId={searchParams.get('contactId') ?? ''}
        onClose={() => setNewSaleOpen(false)}
        open={newSaleOpen}
      />
    </QueryState>
  );
}
