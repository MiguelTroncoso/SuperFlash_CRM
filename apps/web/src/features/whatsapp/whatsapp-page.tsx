'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

import { PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useToastStore } from '@/components/ui/toast';
import { api } from '@/lib/api-client';

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | number;
}): React.ReactElement {
  return (
    <div className="rounded-xl bg-surface-inset p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-content-muted">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-content-primary">{value}</p>
    </div>
  );
}

export function WhatsAppPage({
  settingsOnly = true,
}: { readonly settingsOnly?: boolean } = {}): React.ReactElement {
  void settingsOnly;
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const health = useQuery({
    queryKey: ['whatsapp-read-only-health'],
    queryFn: api.getWhatsAppReadOnlyHealth,
    refetchInterval: 15_000,
  });
  const status = useQuery({
    queryKey: ['whatsapp-read-only-sync-status'],
    queryFn: api.getWhatsAppReadOnlySyncStatus,
    refetchInterval: 15_000,
  });
  const sync = useMutation({
    mutationFn: api.syncWhatsAppReadOnly,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-read-only'] });
      toast({
        title: 'Sincronización completada',
        description: 'Solo se actualizaron datos internos de lectura.',
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({ title: 'Sincronización fallida', description: error.message, tone: 'error' }),
  });
  const reindex = useMutation({
    mutationFn: api.reindexWhatsAppReadOnly,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-read-only'] });
      toast({
        title: 'Reindexación completada',
        description: 'Los contactos manuales no fueron sobrescritos.',
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({ title: 'Reindexación fallida', description: error.message, tone: 'error' }),
  });

  return (
    <QueryState
      isError={health.isError || status.isError}
      isLoading={health.isLoading || status.isLoading}
      onRetry={() => {
        void health.refetch();
        void status.refetch();
      }}
    >
      <div className="space-y-5" data-testid="whatsapp-read-only-page">
        <PageHeader
          eyebrow="Configuración · Canales"
          title="WhatsApp Read Only"
          description="SuperFlash observa el canal y conserva el historial. Las conversaciones continúan en WhatsApp Business."
          actions={
            <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              Solo lectura
            </Badge>
          }
        />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Estado del conector</CardTitle>
              <CardDescription>
                Fuente: {health.data?.source ?? 'read model local'} · sin llamadas externas.
              </CardDescription>
            </div>
            <StatusBadge status={health.data?.status ?? 'PENDING_CONFIGURATION'} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Mensajes" value={health.data?.totals.messages ?? 0} />
              <Metric label="Conversaciones" value={health.data?.totals.conversations ?? 0} />
              <Metric
                label="Último webhook"
                value={formatDate(health.data?.lastWebhookReceivedAt ?? null)}
              />
              <Metric
                label="Última sincronización"
                value={formatDate(status.data?.lastSynchronizedAt ?? null)}
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-content-muted">
              <span>Lectura externa: bloqueada</span>
              <span>·</span>
              <span>Escritura externa: bloqueada</span>
              <span>·</span>
              <span>Mensajes salientes: bloqueados</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={sync.isPending} onClick={() => sync.mutate()}>
                {sync.isPending ? 'Sincronizando…' : 'Sincronizar ahora'}
              </Button>
              <Button
                disabled={reindex.isPending}
                onClick={() => reindex.mutate()}
                variant="outline"
              >
                {reindex.isPending ? 'Reindexando…' : 'Reindexar'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Checkpoint persistente</CardTitle>
              <CardDescription>
                Permite continuar tras reinicios sin reimportar mensajes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {status.data ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-content-muted">Estado</dt>
                    <dd className="font-semibold text-content-primary">{status.data.status}</dd>
                  </div>
                  <div>
                    <dt className="text-content-muted">Cursor</dt>
                    <dd className="truncate font-mono text-xs text-content-primary">
                      {status.data.checkpoint.id ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-content-muted">Mensajes importados</dt>
                    <dd className="font-semibold text-content-primary">
                      {status.data.messagesImported}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-content-muted">Duplicados evitados</dt>
                    <dd className="font-semibold text-content-primary">
                      {status.data.duplicatesAvoided}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-content-muted">Contactos actualizados</dt>
                    <dd className="font-semibold text-content-primary">
                      {status.data.contactsImported}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-content-muted">Errores</dt>
                    <dd className="font-semibold text-content-primary">{status.data.errors}</dd>
                  </div>
                </dl>
              ) : (
                <EmptyState
                  title="Sin sincronizaciones"
                  description="El primer checkpoint se creará al sincronizar."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reglas de seguridad</CardTitle>
              <CardDescription>Garantías del conector en este sprint.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-content-secondary">
              <p>✓ No existe método de envío en el provider Read Only.</p>
              <p>✓ No se editan, eliminan, marcan ni archivan conversaciones del canal.</p>
              <p>✓ Los datos manuales de contactos no se sobrescriben.</p>
              <p>✓ Pipeline, ventas, pagos y fulfillment requieren acciones manuales.</p>
              <p>✓ Los errores usan backoff y quedan auditados.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </QueryState>
  );
}
