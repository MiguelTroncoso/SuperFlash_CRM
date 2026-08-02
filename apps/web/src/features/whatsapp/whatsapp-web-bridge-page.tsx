'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToastStore } from '@/components/ui/toast';
import { api } from '@/lib/api-client';

type ToastPush = (toast: {
  readonly title: string;
  readonly description?: string;
  readonly tone: 'success' | 'error' | 'info';
}) => void;

function useBridgeMutation(
  operation: () => Promise<unknown>,
  success: string,
  queryClient: ReturnType<typeof useQueryClient>,
  toast: ToastPush,
) {
  return useMutation({
    mutationFn: operation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-web-bridge-status'] });
      toast({ title: success, tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'Operación no disponible', description: error.message, tone: 'error' }),
  });
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

export function WhatsAppWebBridgePage(): React.ReactElement {
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const status = useQuery({
    queryKey: ['whatsapp-web-bridge-status'],
    queryFn: api.getWhatsAppWebBridgeStatus,
    refetchInterval: 2_000,
  });
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!status.data?.qr) {
      setQr(null);
      return;
    }
    void QRCode.toDataURL(status.data.qr, { margin: 2, width: 260 }).then(setQr);
  }, [status.data?.qr]);

  const enable = useBridgeMutation(
    api.enableWhatsAppWebBridge,
    'Bridge habilitado',
    queryClient,
    toast,
  );
  const disable = useBridgeMutation(
    api.disableWhatsAppWebBridge,
    'Bridge deshabilitado',
    queryClient,
    toast,
  );
  const pairing = useBridgeMutation(
    api.requestWhatsAppWebBridgePairing,
    'Pairing solicitado',
    queryClient,
    toast,
  );
  const reconnect = useBridgeMutation(
    api.reconnectWhatsAppWebBridge,
    'Reconexión solicitada',
    queryClient,
    toast,
  );
  const unlink = useBridgeMutation(
    api.unlinkWhatsAppWebBridge,
    'Sesión desvinculada',
    queryClient,
    toast,
  );

  return (
    <QueryState
      isError={status.isError}
      isLoading={status.isLoading}
      onRetry={() => void status.refetch()}
    >
      <div className="space-y-5" data-testid="whatsapp-web-bridge-page">
        <PageHeader
          eyebrow="Configuración · Canales"
          title="WhatsApp Web Bridge"
          description="Proveedor transitorio de solo lectura. No envía mensajes, no importa historial y no activa automatizaciones."
          actions={
            <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              Solo lectura
            </Badge>
          }
        />
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Estado del canal</CardTitle>
              <CardDescription>
                El QR se mantiene únicamente en memoria y expira automáticamente.
              </CardDescription>
            </div>
            <StatusBadge status={status.data?.status ?? 'DISABLED'} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-surface-inset p-3">
                <p className="text-xs text-content-muted">Habilitado</p>
                <p className="mt-1 font-bold text-content-primary">
                  {status.data?.enabled ? 'Sí' : 'No'}
                </p>
              </div>
              <div className="rounded-xl bg-surface-inset p-3">
                <p className="text-xs text-content-muted">Número</p>
                <p className="mt-1 font-bold text-content-primary">{status.data?.number ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-surface-inset p-3">
                <p className="text-xs text-content-muted">Último mensaje</p>
                <p className="mt-1 text-xs font-bold text-content-primary">
                  {date(status.data?.lastMessageAt ?? null)}
                </p>
              </div>
              <div className="rounded-xl bg-surface-inset p-3">
                <p className="text-xs text-content-muted">Último heartbeat</p>
                <p className="mt-1 text-xs font-bold text-content-primary">
                  {date(status.data?.lastHeartbeatAt ?? null)}
                </p>
              </div>
            </div>
            {qr ? (
              <div className="flex flex-wrap items-center gap-4">
                <div className="rounded-2xl bg-white p-3 shadow-sm">
                  <img alt="QR temporal de WhatsApp Web" className="h-52 w-52" src={qr} />
                </div>
                <p className="max-w-md text-sm text-content-secondary">
                  Escanea desde WhatsApp Business. Solo se aceptarán mensajes nuevos después de
                  conectar.
                </p>
              </div>
            ) : null}
            {status.data?.lastError ? (
              <p className="text-sm text-rose-600">{status.data.lastError}</p>
            ) : null}
            {!status.data?.configured ? (
              <p className="text-sm text-content-muted">
                El bridge está deshabilitado o incompleto. El CRM continúa funcionando sin este
                canal.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={enable.isPending || status.data?.enabled}
                onClick={() => enable.mutate()}
                size="sm"
              >
                Habilitar
              </Button>
              <Button
                disabled={disable.isPending || !status.data?.enabled}
                onClick={() => disable.mutate()}
                size="sm"
                variant="outline"
              >
                Deshabilitar
              </Button>
              <Button
                disabled={pairing.isPending || !status.data?.enabled}
                onClick={() => pairing.mutate()}
                size="sm"
              >
                Generar QR
              </Button>
              <Button
                disabled={reconnect.isPending || !status.data?.enabled}
                onClick={() => reconnect.mutate()}
                size="sm"
                variant="outline"
              >
                Reconectar
              </Button>
              <Button
                disabled={unlink.isPending || !status.data?.enabled}
                onClick={() => unlink.mutate()}
                size="sm"
                variant="danger"
              >
                Desvincular
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Garantías operativas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-content-secondary">
            <p>✓ Baileys está aislado en un proceso independiente.</p>
            <p>✓ Las sesiones se cifran con AES-256-GCM en el volumen del bridge.</p>
            <p>✓ No se guardan QR, tokens, secretos ni historial de WhatsApp.</p>
            <p>
              ✓ El canal crea/actualiza contactos y oportunidades abiertas sin sobrescribir datos
              manuales.
            </p>
            <p>✓ El composer permanece bloqueado para este proveedor.</p>
          </CardContent>
        </Card>
      </div>
    </QueryState>
  );
}
