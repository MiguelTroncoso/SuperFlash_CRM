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
  NEW: 'Nuevo',
  NUEVO: 'Nuevo',
  MESSAGE_SENT: 'Mensaje enviado',
  DEMO_SENT: 'Demo enviada',
  NO_RESPONSE: 'No responde',
  TALK_LATER: 'Hablar más adelante',
  WANTS_TO_BUY: 'Quiere comprar',
  PURCHASED: 'Compró',
  NEW_LEAD: 'Nuevo',
  NUEVO_LEAD: 'Nuevo',
  LEFT_ON_READ: 'No responde',
  DEJO_EN_VISTO: 'No responde',
  WAITING_CUSTOMER: 'No responde',
  DEMO_DELIVERED: 'Demo enviada',
  DEMO_ENTREGADA: 'Demo enviada',
  COMPRO: 'Compró',
  PAID: 'Compró',
  WON: 'Compró',
  LOST: 'Perdido',
  PERDIDO: 'Perdido',
};

const VISIBLE_STAGE_KEYS = new Set(Object.keys(OPERATIONAL_STAGE_NAMES));

function operationalStageName(stage: PipelineStage): string {
  return (stage.systemKey && OPERATIONAL_STAGE_NAMES[stage.systemKey]) || stage.name;
}

function date(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString('es-CL') : '—';
}

function isoDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('La fecha ingresada no es válida.');
  return parsed.toISOString();
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
    mutationFn: ({ opportunityId, stageId }: { opportunityId: string; stageId: string }) => {
      const stage = pipeline.data?.stages.find((item) => item.id === stageId);
      const body: {
        pipelineStageId: string;
        reason: string;
        nextFollowUpAt?: string;
        estimatedPurchaseAt?: string;
      } = { pipelineStageId: stageId, reason: 'Movimiento desde Kanban' };
      if (stage?.systemKey === 'TALK_LATER' || stage?.systemKey === 'WANTS_TO_BUY') {
        const followUp = window.prompt('Fecha y hora del seguimiento (YYYY-MM-DDTHH:mm):');
        if (!followUp) throw new Error('Este estado requiere una fecha de seguimiento.');
        body.nextFollowUpAt = isoDateTime(followUp);
        if (stage.systemKey === 'WANTS_TO_BUY') {
          const purchase = window.prompt('Fecha estimada de compra (YYYY-MM-DDTHH:mm):');
          if (!purchase) throw new Error('Quiere comprar requiere fecha estimada de compra.');
          body.estimatedPurchaseAt = isoDateTime(purchase);
        }
      }
      return api.moveOpportunity(opportunityId, body);
    },
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
      (pipeline.data?.stages ?? [])
        .filter((stage) => VISIBLE_STAGE_KEYS.has(stage.systemKey ?? ''))
        .map((stage) => ({
          id: stage.id,
          color: stage.color,
          items: stage.opportunities.map((opportunity) => ({
            id: opportunity.id,
            title:
              opportunity.contact.displayName ?? opportunity.contact.phone ?? 'Lead sin nombre',
            subtitle: opportunity.contact.country ?? 'País no informado',
            amount: null,
            status: operationalStageName(opportunity.pipelineStage),
            stageName: operationalStageName(opportunity.pipelineStage),
            category: opportunity.category,
            product: opportunity.product,
            lastStageChangedAt: opportunity.lastStageChangedAt,
            nextFollowUp: opportunity.nextFollowUp,
            estimatedPurchaseAt: opportunity.estimatedPurchaseAt,
          })),
          title: operationalStageName(stage),
        })),
    [pipeline.data],
  );
  const total =
    (pipeline.data as PipelineResponse | undefined)?.stages
      .filter((stage) => VISIBLE_STAGE_KEYS.has(stage.systemKey ?? ''))
      .reduce((sum, stage) => sum + stage.opportunities.length, 0) ?? 0;
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
                  Categoría: {item.category?.name ?? 'Sin categoría'}
                </p>
                <p className="mt-2 truncate text-xs text-content-secondary">
                  Producto: {item.product?.name ?? 'Sin producto'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-content-muted">
                  <span>Movimiento: {date(item.lastStageChangedAt)}</span>
                  <span>Seguimiento: {date(item.nextFollowUp?.dueAt)}</span>
                </div>
                {item.estimatedPurchaseAt ? (
                  <p className="mt-2 text-[11px] text-content-muted">
                    Compra estimada: {date(item.estimatedPurchaseAt)}
                  </p>
                ) : null}
              </>
            )}
          />
        </Card>
      </PageGrid>
      <LeadIntakeDrawer onClose={() => setLeadOpen(false)} open={leadOpen} />
    </QueryState>
  );
}
