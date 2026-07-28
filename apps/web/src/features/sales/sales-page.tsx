'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { api, queryString } from '@/lib/api-client';
import type { Sale } from '@/lib/types';

export function SalesPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Sale | null>(null);
  const sales = useQuery({
    queryKey: ['sales', page, search],
    queryFn: () => api.getSales(queryString({ page, limit: 25, search })),
  });
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
          description="Consulta acuerdos comerciales, estados y snapshots desde el backend."
          actions={
            <Button onClick={() => window.location.assign('/contacts')} variant="outline">
              Ir a contactos
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
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
                  <p className="text-xs text-slate-400">Estado</p>
                  <div className="mt-2">
                    <StatusBadge status={selected.status} />
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
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
    </QueryState>
  );
}
