'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { api, queryString } from '@/lib/api-client';
import type { JsonRecord } from '@/lib/types';

const views = [
  ['summary', 'Resumen'],
  ['countries', 'Países'],
  ['products', 'Productos'],
  ['campaigns', 'Campañas'],
  ['sellers', 'Vendedores'],
  ['providers', 'Providers'],
  ['renewals', 'Renovaciones'],
] as const;

function value(row: JsonRecord, key: string): string {
  const item = row[key];
  if (item === null || item === undefined || item === '') return '—';
  if (typeof item === 'object') return JSON.stringify(item);
  return String(item);
}

function rowsFromData(data: JsonRecord | JsonRecord[]): JsonRecord[] {
  if (Array.isArray(data)) return data;
  return Object.entries(data).flatMap(([key, item]) => {
    if (Array.isArray(item))
      return item.map((entry) => ({ dimension: key, ...(entry as JsonRecord) }));
    return [{ dimension: key, value: item }];
  });
}

export function BusinessIntelligencePage({
  view = 'summary',
}: {
  readonly view?: string;
}): React.ReactElement {
  const [filters, setFilters] = useState({ from: '', to: '', country: '', currency: '' });
  const activeView = views.some(([key]) => key === view) ? view : 'summary';
  const query = useMemo(() => queryString(filters), [filters]);
  const result = useQuery({
    queryKey: ['business-intelligence', activeView, query],
    queryFn: () => api.getBusinessIntelligence(activeView, query),
    staleTime: 60_000,
  });
  const rows = result.data ? rowsFromData(result.data.data) : [];
  return (
    <QueryState
      isError={result.isError}
      isLoading={result.isLoading}
      onRetry={() => void result.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Business Intelligence"
          title={views.find(([key]) => key === activeView)?.[1] ?? 'Resumen'}
          description="Explora el rendimiento comercial por dimensión a partir de datos transaccionales persistidos."
        />
        <nav
          aria-label="Vistas de inteligencia"
          className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0"
        >
          <div className="flex min-w-max gap-2">
            {views.map(([key, label]) => (
              <Link href={`/business-intelligence${key === 'summary' ? '' : `/${key}`}`} key={key}>
                <Button variant={activeView === key ? 'primary' : 'outline'}>{label}</Button>
              </Link>
            ))}
          </div>
        </nav>
        <Card>
          <CardContent className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-content-secondary">
              Desde
              <Input
                className="mt-1"
                type="date"
                value={filters.from}
                onChange={(event) => setFilters({ ...filters, from: event.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-content-secondary">
              Hasta
              <Input
                className="mt-1"
                type="date"
                value={filters.to}
                onChange={(event) => setFilters({ ...filters, to: event.target.value })}
              />
            </label>
            <label className="text-xs font-semibold text-content-secondary">
              País
              <Input
                className="mt-1"
                maxLength={2}
                placeholder="CL"
                value={filters.country}
                onChange={(event) =>
                  setFilters({ ...filters, country: event.target.value.toUpperCase() })
                }
              />
            </label>
            <label className="text-xs font-semibold text-content-secondary">
              Moneda
              <Select
                className="mt-1"
                value={filters.currency}
                onChange={(event) => setFilters({ ...filters, currency: event.target.value })}
              >
                <option value="">Todas</option>
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="MXN">MXN</option>
              </Select>
            </label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{rows.length ? `${rows.length} resultados` : 'Sin resultados'}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {rows.length ? (
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border-subtle text-xs uppercase text-content-muted">
                  <tr>
                    <th className="px-5 py-3">Dimensión</th>
                    <th className="px-5 py-3">Resultado</th>
                    <th className="px-5 py-3">Detalle</th>
                    <th className="px-5 py-3">Conversión / estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row, index) => (
                    <tr
                      className="border-b border-border-subtle last:border-0"
                      key={`${value(row, 'id')}-${index}`}
                    >
                      <td className="px-5 py-3 font-semibold text-content-primary">
                        {value(row, 'country') !== '—'
                          ? value(row, 'country')
                          : value(row, 'product') !== '—'
                            ? value(row, 'product')
                            : value(row, 'name') !== '—'
                              ? value(row, 'name')
                              : value(row, 'dimension')}
                      </td>
                      <td className="px-5 py-3 text-content-primary">
                        {value(row, 'revenue') !== '—'
                          ? `${value(row, 'currency')} ${value(row, 'revenue')}`
                          : value(row, 'amount') !== '—'
                            ? `${value(row, 'currency')} ${value(row, 'amount')}`
                            : value(row, 'count')}
                      </td>
                      <td className="px-5 py-3 text-content-secondary">
                        {value(row, 'sales') !== '—'
                          ? `${value(row, 'sales')} ventas`
                          : value(row, 'units') !== '—'
                            ? `${value(row, 'units')} unidades`
                            : value(row, 'status')}
                      </td>
                      <td className="px-5 py-3 text-content-secondary">
                        {value(row, 'conversionRate') !== '—'
                          ? `${value(row, 'conversionRate')}%`
                          : value(row, 'successRate') !== '—'
                            ? `${value(row, 'successRate')}% éxito`
                            : value(row, 'detail')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-sm text-content-muted">
                Aún no existen datos suficientes para esta vista.
              </div>
            )}
          </CardContent>
        </Card>
      </PageGrid>
    </QueryState>
  );
}
