'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { api, queryString } from '@/lib/api-client';

export function PipelineIntelligencePage(): React.ReactElement {
  const [filters, setFilters] = useState({
    priority: '',
    country: '',
    minAgeDays: '',
    stalledDays: '7',
    stalled: false,
    noActivity: false,
    overdueFollowUp: false,
  });
  const query = useMemo(() => queryString(filters), [filters]);
  const pipeline = useQuery({
    queryKey: ['pipeline-intelligence', query],
    queryFn: () => api.getPipelineIntelligence(query),
    staleTime: 30_000,
  });
  return (
    <QueryState
      isError={pipeline.isError}
      isLoading={pipeline.isLoading}
      onRetry={() => void pipeline.refetch()}
    >
      {pipeline.data ? (
        <PageGrid>
          <PageHeader
            eyebrow="Pipeline · Intelligence"
            title="Pipeline avanzado"
            description="Prioriza oportunidades por antigüedad, probabilidad, valor ponderado y señales de estancamiento"
            actions={
              <Link href="/pipeline">
                <Button variant="outline">Vista Kanban</Button>
              </Link>
            }
          />
          <Card>
            <CardContent className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-xs font-semibold text-content-secondary">
                Prioridad
                <Select
                  className="mt-1"
                  value={filters.priority}
                  onChange={(event) => setFilters({ ...filters, priority: event.target.value })}
                >
                  <option value="">Todas</option>
                  <option value="URGENT">Urgente</option>
                  <option value="HIGH">Alta</option>
                  <option value="NORMAL">Normal</option>
                  <option value="LOW">Baja</option>
                </Select>
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
                Edad mínima (días)
                <Input
                  className="mt-1"
                  min={0}
                  type="number"
                  value={filters.minAgeDays}
                  onChange={(event) => setFilters({ ...filters, minAgeDays: event.target.value })}
                />
              </label>
              <label className="text-xs font-semibold text-content-secondary">
                Estancado desde
                <Select
                  className="mt-1"
                  value={filters.stalledDays}
                  onChange={(event) => setFilters({ ...filters, stalledDays: event.target.value })}
                >
                  <option value="3">3 días</option>
                  <option value="7">7 días</option>
                  <option value="14">14 días</option>
                  <option value="30">30 días</option>
                </Select>
              </label>
              <div className="flex flex-col justify-end gap-2 pb-1 text-xs font-semibold text-content-secondary">
                <label className="flex items-center gap-2">
                  <input
                    checked={filters.stalled}
                    onChange={(event) => setFilters({ ...filters, stalled: event.target.checked })}
                    type="checkbox"
                  />
                  Estancadas
                </label>
                <label className="flex items-center gap-2">
                  <input
                    checked={filters.noActivity}
                    onChange={(event) =>
                      setFilters({ ...filters, noActivity: event.target.checked })
                    }
                    type="checkbox"
                  />{' '}
                  Sin actividad
                </label>
                <label className="flex items-center gap-2">
                  <input
                    checked={filters.overdueFollowUp}
                    onChange={(event) =>
                      setFilters({ ...filters, overdueFollowUp: event.target.checked })
                    }
                    type="checkbox"
                  />{' '}
                  Seguimiento vencido
                </label>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-border-subtle text-xs uppercase text-content-muted">
                  <tr>
                    <th className="px-5 py-3">Oportunidad</th>
                    <th className="px-5 py-3">Etapa</th>
                    <th className="px-5 py-3">Responsable</th>
                    <th className="px-5 py-3">Probabilidad</th>
                    <th className="px-5 py-3">Valor ponderado</th>
                    <th className="px-5 py-3">Edad</th>
                    <th className="px-5 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.data.data.map((item) => (
                    <tr className="border-b border-border-subtle last:border-0" key={item.id}>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-content-primary">{item.title}</p>
                        <p className="text-xs text-content-muted">
                          {typeof item.contact.firstName === 'string'
                            ? `${item.contact.firstName} ${typeof item.contact.lastName === 'string' ? item.contact.lastName : ''}`
                            : 'Sin contacto'}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-content-secondary">
                        {String(item.pipelineStage.name ?? '—')}
                      </td>
                      <td className="px-5 py-3 text-content-secondary">
                        {item.owner
                          ? `${item.owner.firstName} ${item.owner.lastName ?? ''}`
                          : 'Sin asignar'}
                      </td>
                      <td className="px-5 py-3 font-bold text-content-primary">
                        {item.probability}%
                      </td>
                      <td className="px-5 py-3 font-bold text-content-primary">
                        {item.currency ?? ''} {item.weightedValue ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-content-secondary">
                        {item.ageDays}d / {item.daysInStage ?? '—'}d etapa
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            item.stalled
                              ? 'rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                              : 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                          }
                        >
                          {item.stalled ? 'Estancada' : 'Activa'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!pipeline.data.data.length ? (
                <div className="p-8 text-center text-sm text-content-muted">
                  No hay oportunidades con estos filtros.
                </div>
              ) : null}
            </CardContent>
          </Card>
          <p className="text-xs text-content-muted">
            {pipeline.data.pagination.total} oportunidades · página {pipeline.data.pagination.page}{' '}
            de {pipeline.data.pagination.totalPages}
          </p>
        </PageGrid>
      ) : null}
    </QueryState>
  );
}
