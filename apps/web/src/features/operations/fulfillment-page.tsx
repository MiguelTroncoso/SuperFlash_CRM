'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { Fulfillment } from '@/lib/types';

export function FulfillmentPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Fulfillment | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const fulfillments = useQuery({
    queryKey: ['fulfillments', page],
    queryFn: () => api.getFulfillments(queryString({ page, limit: 25 })),
  });
  const attempts = useQuery({
    queryKey: ['provisioning-attempts', selected?.id],
    queryFn: () => api.getProvisioningAttempts(queryString({ fulfillmentId: selected?.id })),
    enabled: Boolean(selected?.id),
  });
  const providers = useQuery({
    queryKey: ['providers-for-fulfillment'],
    queryFn: () => api.getProviders(queryString({ page: 1, limit: 100, status: 'ACTIVE' })),
  });
  const assign = useMutation({
    mutationFn: () =>
      selected
        ? api.assignFulfillment(selected.id, { providerId: selectedProviderId || undefined })
        : Promise.reject(new Error('Fulfillment no seleccionado')),
    onSuccess: (updated) => {
      setSelected(updated);
      void queryClient.invalidateQueries({ queryKey: ['fulfillments'] });
      toast({ title: 'Provider asignado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible asignar', description: error.message, tone: 'error' }),
  });
  const action = useMutation({
    mutationFn: (input: { id: string; action: 'start' | 'complete' | 'fail' | 'cancel' }) =>
      input.action === 'start'
        ? api.startFulfillment(input.id)
        : input.action === 'complete'
          ? api.completeFulfillment(input.id)
          : input.action === 'fail'
            ? api.failFulfillment(input.id, {
                reason: 'Falló la operación manual desde el workspace',
                retryable: true,
              })
            : api.cancelFulfillment(input.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fulfillments'] });
      toast({ title: 'Fulfillment actualizado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'Transición no permitida', description: error.message, tone: 'error' }),
  });
  return (
    <QueryState
      isError={fulfillments.isError}
      isLoading={fulfillments.isLoading}
      onRetry={() => void fulfillments.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Operaciones"
          title="Fulfillment"
          description="Asigna, ejecuta y diagnostica obligaciones de entrega sin crear registros manualmente."
        />
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              {(fulfillments.data?.data ?? []).map((item) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                  key={item.id}
                >
                  <button
                    className="text-left"
                    onClick={() => {
                      setSelected(item);
                      setSelectedProviderId(item.providerId ?? '');
                    }}
                    type="button"
                  >
                    <p className="font-mono text-xs font-bold text-brand-600">
                      #{item.id.slice(0, 8)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Venta #{item.saleId.slice(0, 8)} · {item.mode} · {item.attemptCount} intentos
                    </p>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.status} />
                    {['PENDING', 'ASSIGNED', 'FAILED'].includes(item.status) ? (
                      <Button
                        onClick={() => action.mutate({ id: item.id, action: 'start' })}
                        size="sm"
                        variant="outline"
                      >
                        {item.status === 'FAILED' ? 'Retry' : 'Iniciar'}
                      </Button>
                    ) : null}
                    {['PENDING', 'ASSIGNED', 'PROCESSING'].includes(item.status) ? (
                      <Button
                        onClick={() => action.mutate({ id: item.id, action: 'complete' })}
                        size="sm"
                        variant="outline"
                      >
                        Completar
                      </Button>
                    ) : null}
                    {item.status === 'PROCESSING' ? (
                      <Button
                        onClick={() => action.mutate({ id: item.id, action: 'fail' })}
                        size="sm"
                        variant="ghost"
                      >
                        Marcar fallo
                      </Button>
                    ) : null}
                    {!['COMPLETED', 'CANCELLED'].includes(item.status) ? (
                      <Button
                        onClick={() => action.mutate({ id: item.id, action: 'cancel' })}
                        size="sm"
                        variant="ghost"
                      >
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
              {fulfillments.data?.data.length === 0 ? (
                <EmptyState
                  title="Sin fulfillments"
                  description="Los fulfillments nacen automáticamente desde ventas confirmadas. No se crean manualmente."
                />
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Pagination
          onPageChange={setPage}
          page={page}
          totalPages={fulfillments.data?.pagination.totalPages ?? 1}
        />
      </PageGrid>
      <Drawer
        onClose={() => setSelected(null)}
        open={Boolean(selected)}
        title="Detalle de fulfillment"
      >
        {selected ? (
          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-400">Estado</p>
                <StatusBadge status={selected.status} />
              </div>
              <div>
                <p className="text-xs text-slate-400">Intentos</p>
                <p className="font-bold">{selected.attemptCount}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Error</p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">
                {selected.failureReason ?? 'Sin errores registrados.'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Provisioning attempts
              </p>
              {(attempts.data?.data ?? []).length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">Aún no hay intentos.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {attempts.data?.data.map((attempt) => (
                    <pre
                      className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-[11px] text-slate-200"
                      key={String(attempt.id)}
                    >
                      {JSON.stringify(attempt, null, 2)}
                    </pre>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Provider</p>
                <div className="flex gap-2">
                  <Select
                    onChange={(event) => setSelectedProviderId(event.target.value)}
                    value={selectedProviderId}
                  >
                    <option value="">Sin asignar</option>
                    {(providers.data?.data ?? []).map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </Select>
                  <Button disabled={assign.isPending} onClick={() => assign.mutate()} size="sm">
                    Asignar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </QueryState>
  );
}
