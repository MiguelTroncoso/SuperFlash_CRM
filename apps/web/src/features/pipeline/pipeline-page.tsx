'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageHeader, PageGrid } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KanbanBoard } from '@/components/ui/kanban-board';
import { SearchBar } from '@/components/ui/search-bar';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { LeadIntakeDrawer } from '@/features/leads/lead-intake-drawer';
import { api, queryString } from '@/lib/api-client';
import type { PipelineResponse, PipelineStage } from '@/lib/types';

const OPERATIONAL_STAGE_NAMES: Record<string, string> = {
  NEW_LEAD: 'Nuevo',
  LEFT_ON_READ: 'Esperando respuesta',
  DEMO_DELIVERED: 'Demo enviada',
  AWAITING_CREDIT_USAGE: 'Precio enviado',
  AWAITING_MONEY: 'Debe pagar',
  POTENTIAL_BUYER: 'Interesado',
  WON: 'Pagó',
  LOST: 'Perdido',
};

function operationalStageName(stage: PipelineStage): string {
  return (stage.systemKey && OPERATIONAL_STAGE_NAMES[stage.systemKey]) || stage.name;
}

function date(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString('es-CL') : '—';
}

export function PipelinePage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const [leadOpen, setLeadOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const pipeline = useQuery({
    queryKey: ['pipeline', search],
    queryFn: () => api.getPipeline(queryString({ search, limit: 50 })),
  });
  const move = useMutation({
    mutationFn: ({ opportunityId, stageId }: { opportunityId: string; stageId: string }) =>
      api.moveOpportunity(opportunityId, {
        pipelineStageId: stageId,
        reason: 'Movimiento desde Kanban',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      toast({
        title: 'Oportunidad movida',
        description: 'El cambio quedó registrado en el historial.',
        tone: 'success',
      });
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      toast({ title: 'No fue posible moverla', description: error.message, tone: 'error' });
    },
  });
  const columns = useMemo(
    () =>
      (pipeline.data?.stages ?? []).map((stage) => ({
        id: stage.id,
        color: stage.color,
        items: stage.opportunities.map((opportunity) => ({
          id: opportunity.id,
          title: opportunity.contact.displayName ?? opportunity.contact.phone ?? 'Lead sin nombre',
          subtitle: opportunity.contact.country ?? 'País no informado',
          amount: null,
          status: operationalStageName(opportunity.pipelineStage),
          stageName: operationalStageName(opportunity.pipelineStage),
          product: opportunity.product,
          lastStageChangedAt: opportunity.lastStageChangedAt,
          nextFollowUp: opportunity.nextFollowUp,
        })),
        title: operationalStageName(stage),
      })),
    [pipeline.data],
  );
  const total =
    (pipeline.data as PipelineResponse | undefined)?.stages.reduce(
      (sum, stage) => sum + stage.opportunities.length,
      0,
    ) ?? 0;
  return (
    <QueryState
      isError={pipeline.isError}
      isLoading={pipeline.isLoading}
      onRetry={() => void pipeline.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Revenue engine"
          title="Pipeline"
          description="Arrastra oportunidades entre etapas para mantener el proceso comercial en movimiento."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href="/sales">
                <Button variant="outline">＋ Nueva venta</Button>
              </Link>
              <Button onClick={() => setLeadOpen(true)}>＋ Registrar Lead</Button>
            </div>
          }
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBar
            className="sm:max-w-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar oportunidades..."
            value={search}
          />
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-brand-50 px-3 py-1.5 font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              {total} oportunidades
            </span>
            <span>Actualización automática</span>
          </div>
        </div>
        <Card className="overflow-hidden p-4">
          <KanbanBoard
            columns={columns}
            onMove={(opportunityId, stageId) => move.mutate({ opportunityId, stageId })}
            renderItem={(item) => (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                    {item.title}
                  </p>
                  {item.status ? <StatusBadge status={item.status} /> : null}
                </div>
                <p className="mt-2 truncate text-xs text-slate-500">{item.subtitle}</p>
                <p className="mt-2 truncate text-xs text-content-secondary">
                  Producto: {item.product?.name ?? 'Sin producto'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-content-muted">
                  <span>Movimiento: {date(item.lastStageChangedAt)}</span>
                  <span>Seguimiento: {date(item.nextFollowUp?.dueAt)}</span>
                </div>
              </>
            )}
          />
        </Card>
      </PageGrid>
      <LeadIntakeDrawer onClose={() => setLeadOpen(false)} open={leadOpen} />
    </QueryState>
  );
}
