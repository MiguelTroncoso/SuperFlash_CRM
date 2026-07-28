'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { StatusBadge } from '@/components/ui/badge';
import { api, queryString } from '@/lib/api-client';
import type { AutomationExecution } from '@/lib/types';
import { useState } from 'react';

const columns: ColumnDef<AutomationExecution, unknown>[] = [
  {
    accessorKey: 'ruleName',
    header: 'Regla',
    cell: ({ row }) => (
      <span className="font-semibold text-slate-900 dark:text-white">{row.original.ruleName}</span>
    ),
  },
  {
    accessorKey: 'trigger',
    header: 'Trigger',
    cell: ({ row }) => <span className="text-xs font-semibold">{row.original.trigger}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Estado',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'attempts',
    header: 'Intentos',
    cell: ({ row }) => <span>{row.original.attempts}</span>,
  },
  {
    accessorKey: 'requestId',
    header: 'Request ID',
    cell: ({ row }) => (
      <span className="font-mono text-[11px]">{row.original.requestId.slice(0, 12)}…</span>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Creada',
    cell: ({ row }) => (
      <span className="text-xs">{new Date(row.original.createdAt).toLocaleString()}</span>
    ),
  },
];

export function AutomationExecutionsPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const executions = useQuery({
    queryKey: ['automation-executions', page],
    queryFn: () => api.getAutomationExecutions(queryString({ page, limit: 25 })),
  });
  return (
    <QueryState
      isError={executions.isError}
      isLoading={executions.isLoading}
      onRetry={() => void executions.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Communications engine"
          title="Historial de ejecuciones"
          description="Observa cada regla, intento y resultado sin perder el contexto de correlación."
          actions={
            <Button onClick={() => void executions.refetch()} variant="outline">
              Actualizar
            </Button>
          }
        />
        <Card>
          <DataTable
            columns={columns}
            data={executions.data?.data ?? []}
            emptyDescription="Las ejecuciones de automatizaciones aparecerán aquí."
            emptyTitle="Sin ejecuciones"
            virtualize
          />
          <Pagination
            onPageChange={setPage}
            page={page}
            totalPages={executions.data?.pagination.totalPages ?? 1}
          />
        </Card>
      </PageGrid>
    </QueryState>
  );
}
