'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';

import { PageHeader, PageGrid } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { Pagination } from '@/components/ui/pagination';
import { PermissionGate } from '@/components/ui/permission-gate';
import { SearchBar } from '@/components/ui/search-bar';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type {
  Activation,
  CredentialRecord,
  Fulfillment,
  Paginated,
  Provider,
  Trial,
} from '@/lib/types';

interface ResourceListProps<T> {
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly queryKey: string;
  readonly queryFn: (query: string) => Promise<Paginated<T>>;
  readonly columns: ColumnDef<T, unknown>[];
  readonly searchPlaceholder: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}

function ResourceListPage<T>({
  title,
  eyebrow,
  description,
  queryKey,
  queryFn,
  columns,
  searchPlaceholder,
  emptyTitle,
  emptyDescription,
}: ResourceListProps<T>): React.ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: [queryKey, page, search],
    queryFn: () => queryFn(queryString({ page, limit: 25, search })),
  });
  return (
    <QueryState
      isError={query.isError}
      isLoading={query.isLoading}
      onRetry={() => void query.refetch()}
    >
      <PageGrid>
        <PageHeader eyebrow={eyebrow} title={title} description={description} />
        <SearchBar
          className="max-w-sm"
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder={searchPlaceholder}
          value={search}
        />
        <Card>
          <DataTable
            columns={columns}
            data={query.data?.data ?? []}
            emptyDescription={emptyDescription}
            emptyTitle={emptyTitle}
          />
          <Pagination
            onPageChange={setPage}
            page={page}
            totalPages={query.data?.pagination.totalPages ?? 1}
          />
        </Card>
      </PageGrid>
    </QueryState>
  );
}

export function ProvidersPage(): React.ReactElement {
  const columns: ColumnDef<Provider, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Provider',
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-slate-800 dark:text-slate-100">{row.original.name}</p>
          <p className="mt-1 text-xs text-slate-400">{row.original.slug}</p>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Tipo',
      cell: ({ row }) => <span className="text-xs font-semibold">{row.original.type}</span>,
    },
    {
      accessorKey: 'fulfillmentMode',
      header: 'Modo',
      cell: ({ row }) => <span>{row.original.fulfillmentMode}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];
  return (
    <ResourceListPage
      columns={columns}
      description="Administra las fuentes de entrega disponibles para tu organización."
      emptyDescription="Los providers activos y configurados aparecerán aquí."
      emptyTitle="No hay providers"
      eyebrow="Operations"
      queryFn={api.getProviders}
      queryKey="providers"
      searchPlaceholder="Buscar provider..."
      title="Providers"
    />
  );
}

export function FulfillmentPage(): React.ReactElement {
  const columns: ColumnDef<Fulfillment, unknown>[] = [
    {
      accessorKey: 'status',
      header: 'Fulfillment',
      cell: () => (
        <span className="font-mono text-xs font-bold text-brand-600">Entrega operativa</span>
      ),
    },
    {
      accessorKey: 'mode',
      header: 'Venta',
      cell: () => <span className="text-xs text-slate-500">Venta comercial</span>,
    },
    { accessorKey: 'mode', header: 'Modo', cell: ({ row }) => <span>{row.original.mode}</span> },
    {
      accessorKey: 'attemptCount',
      header: 'Intentos',
      cell: ({ row }) => <span className="font-bold">{row.original.attemptCount}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];
  return (
    <ResourceListPage
      columns={columns}
      description="Controla obligaciones de entrega, intentos y fallos operativos."
      emptyDescription="Cuando una venta confirmada requiera entrega, aparecerá aquí."
      emptyTitle="Sin fulfillments"
      eyebrow="Operations"
      queryFn={api.getFulfillments}
      queryKey="fulfillments"
      searchPlaceholder="Buscar por venta..."
      title="Fulfillment"
    />
  );
}

export function TrialsPage(): React.ReactElement {
  const columns: ColumnDef<Trial, unknown>[] = [
    {
      accessorKey: 'status',
      header: 'Trial',
      cell: () => (
        <span className="font-mono text-xs font-bold text-brand-600">Demo comercial</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Contacto',
      cell: () => <span className="font-mono text-xs text-slate-500">Cliente comercial</span>,
    },
    {
      accessorKey: 'durationMinutes',
      header: 'Duración',
      cell: ({ row }) => <span>{row.original.durationMinutes} min</span>,
    },
    {
      accessorKey: 'endsAt',
      header: 'Termina',
      cell: ({ row }) => (
        <span className="text-xs text-slate-400">
          {new Date(row.original.endsAt).toLocaleString('es-CL')}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];
  return (
    <ResourceListPage
      columns={columns}
      description="Demos temporales con fechas, responsables y estado de conversión."
      emptyDescription="Las demos solicitadas desde el backend aparecerán aquí."
      emptyTitle="No hay trials"
      eyebrow="Operations"
      queryFn={api.getTrials}
      queryKey="trials"
      searchPlaceholder="Buscar trial..."
      title="Trials"
    />
  );
}

export function ActivationsPage(): React.ReactElement {
  const query = useQuery({ queryKey: ['activations'], queryFn: () => api.getActivations() });
  const columns: ColumnDef<Activation, unknown>[] = [
    {
      accessorKey: 'status',
      header: 'Activación',
      cell: () => (
        <span className="font-mono text-xs font-bold text-brand-600">Activación operativa</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Fulfillment',
      cell: () => <span className="font-mono text-xs text-slate-500">Entrega asociada</span>,
    },
    {
      accessorKey: 'externalReference',
      header: 'Referencia',
      cell: ({ row }) => <span>{row.original.externalReference ?? '—'}</span>,
    },
    {
      accessorKey: 'expiresAt',
      header: 'Expira',
      cell: ({ row }) => (
        <span className="text-xs text-slate-400">
          {row.original.expiresAt
            ? new Date(row.original.expiresAt).toLocaleDateString('es-CL')
            : 'Sin fecha'}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];
  return (
    <QueryState
      isError={query.isError}
      isLoading={query.isLoading}
      onRetry={() => void query.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Operations"
          title="Activaciones"
          description="Supervisa el resultado operativo de fulfillments completados."
        />
        <Card>
          <DataTable
            columns={columns}
            data={query.data?.data ?? []}
            emptyDescription="Las activaciones creadas desde fulfillment aparecerán aquí."
            emptyTitle="No hay activaciones"
          />
        </Card>
      </PageGrid>
    </QueryState>
  );
}

export function CredentialsPage(): React.ReactElement {
  const [selected, setSelected] = useState<CredentialRecord | null>(null);
  const toast = useToastStore((state) => state.push);
  const query = useQuery({ queryKey: ['credentials'], queryFn: () => api.getCredentials() });
  const reveal = useMutation({
    mutationFn: (id: string) => api.revealCredential(id),
    onSuccess: (credential) => setSelected(credential),
    onError: (error: Error) =>
      toast({ title: 'Reveal no autorizado', description: error.message, tone: 'error' }),
  });
  const columns: ColumnDef<CredentialRecord, unknown>[] = [
    {
      accessorKey: 'status',
      header: 'Registro',
      cell: () => (
        <div>
          <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
            Credencial segura
          </p>
          <p className="mt-1 text-xs text-slate-400">Los secretos están enmascarados.</p>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'expiresAt',
      header: 'Expiración',
      cell: ({ row }) => (
        <span>
          {row.original.expiresAt
            ? new Date(row.original.expiresAt).toLocaleDateString('es-CL')
            : 'Sin fecha'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <PermissionGate
          permission="credentials.reveal"
          fallback={<span className="text-xs text-slate-400">Sin permiso</span>}
        >
          <Button
            disabled={reveal.isPending}
            onClick={() => reveal.mutate(row.original.id)}
            size="sm"
            variant="outline"
          >
            Revelar
          </Button>
        </PermissionGate>
      ),
    },
  ];
  return (
    <QueryState
      isError={query.isError}
      isLoading={query.isLoading}
      onRetry={() => void query.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Secure operations"
          title="Credenciales"
          description="La plataforma muestra valores enmascarados por defecto y audita cada revelado autorizado."
        />
        <Card>
          <DataTable
            columns={columns}
            data={query.data?.data ?? []}
            emptyDescription="Las credenciales generadas por la operación aparecerán aquí."
            emptyTitle="No hay credenciales"
          />
        </Card>
        <Drawer
          description="Este contenido fue revelado por una acción autorizada y no se guarda en el estado persistente del navegador."
          onClose={() => setSelected(null)}
          open={Boolean(selected)}
          title="Credencial revelada"
        >
          <div className="space-y-4">
            {selected
              ? [
                  ['Usuario', selected.username],
                  ['Contraseña', selected.password],
                  ['URL', selected.url],
                  ['Token', selected.token],
                ].map(([label, value]) => (
                  <div
                    className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                    key={label}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {label}
                    </p>
                    <p className="mt-2 break-all font-mono text-sm text-slate-900 dark:text-white">
                      {value ?? '—'}
                    </p>
                  </div>
                ))
              : null}
          </div>
        </Drawer>
      </PageGrid>
    </QueryState>
  );
}
