'use client';

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { EmptyState } from './empty-state';
import { Skeleton } from './skeleton';

interface DataTableProps<TData> {
  readonly columns: ColumnDef<TData, unknown>[];
  readonly data: TData[];
  readonly isLoading?: boolean;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly emptyAction?: React.ReactNode;
  readonly virtualize?: boolean;
}

export function DataTable<TData>({
  columns,
  data,
  isLoading,
  emptyTitle = 'Sin resultados',
  emptyDescription = 'Aún no hay información para mostrar.',
  emptyAction,
  virtualize = false,
}: DataTableProps<TData>): React.ReactElement {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const [scrollTop, setScrollTop] = useState(0);
  const rows = table.getRowModel().rows;
  const rowHeight = 72;
  const shouldVirtualize = virtualize && rows.length > 40;
  const windowStart = shouldVirtualize ? Math.max(0, Math.floor(scrollTop / rowHeight) - 5) : 0;
  const windowEnd = shouldVirtualize ? Math.min(rows.length, windowStart + 20) : rows.length;
  const visibleRows = useMemo(
    () => rows.slice(windowStart, windowEnd),
    [rows, windowEnd, windowStart],
  );
  if (isLoading)
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton className="h-11" key={index} />
        ))}
      </div>
    );
  if (data.length === 0)
    return <EmptyState action={emptyAction} title={emptyTitle} description={emptyDescription} />;
  return (
    <div
      className={cn('overflow-x-auto', shouldVirtualize && 'max-h-[620px] overflow-y-auto')}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border-subtle bg-surface-inset text-[11px] uppercase tracking-[0.1em] text-content-muted">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th className="px-5 py-3 font-semibold" key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {shouldVirtualize && windowStart > 0 ? (
            <tr aria-hidden="true" style={{ height: windowStart * rowHeight }}>
              <td colSpan={columns.length} />
            </tr>
          ) : null}
          {visibleRows.map((row) => (
            <tr className="transition hover:bg-surface-muted" key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td className={cn('px-5 py-4 align-middle text-content-secondary')} key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {shouldVirtualize && windowEnd < rows.length ? (
            <tr aria-hidden="true" style={{ height: (rows.length - windowEnd) * rowHeight }}>
              <td colSpan={columns.length} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
