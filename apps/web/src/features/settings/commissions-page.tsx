'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToastStore } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import type { JsonRecord } from '@/lib/types';

const METHODS = [
  'TRANSFER',
  'PAYPAL',
  'BINANCE',
  'MERCADOPAGO',
  'STRIPE',
  'CASH',
  'MANUAL',
  'OTHER',
];

export function CommissionsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const configs = useQuery({
    queryKey: ['payment-commissions'],
    queryFn: api.getCommissionConfigs,
  });
  const update = useMutation({
    mutationFn: (body: JsonRecord) => api.updateCommissionConfig(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-commissions'] });
      toast({ title: 'Comisión actualizada', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible actualizar', description: error.message, tone: 'error' }),
  });
  return (
    <QueryState
      isError={configs.isError}
      isLoading={configs.isLoading}
      onRetry={() => void configs.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Configuración · Finanzas"
          title="Comisiones de pago"
          description="Define el costo real por método. PayPal usa 4,95% + USD 0,49 por defecto."
        />
        <div className="grid gap-3">
          {METHODS.map((method) => {
            const current = configs.data?.find((row) => row.method === method) ?? {
              method,
              percentage: '0',
              fixedFee: '0',
              internationalPercentage: '0',
              conversionPercentage: '0',
              active: true,
            };
            return (
              <CommissionRow config={current} key={method} onSave={(body) => update.mutate(body)} />
            );
          })}
        </div>
      </PageGrid>
    </QueryState>
  );
}

function CommissionRow({
  config,
  onSave,
}: {
  readonly config: JsonRecord;
  readonly onSave: (body: JsonRecord) => void;
}): React.ReactElement {
  const method = String(config.method);
  return (
    <Card className="p-4">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_repeat(4,minmax(0,1fr))_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSave({
            method,
            percentage: form.get('percentage'),
            fixedFee: form.get('fixedFee'),
            internationalPercentage: form.get('internationalPercentage'),
            conversionPercentage: form.get('conversionPercentage'),
            active: form.get('active') === 'on',
          });
        }}
      >
        <div>
          <p className="text-sm font-bold text-content-primary">{method}</p>
          <p className="text-xs text-content-muted">Fee operativo</p>
        </div>
        <label className="text-xs font-semibold text-content-secondary">
          % base
          <Input
            name="percentage"
            defaultValue={String(config.percentage ?? '0')}
            inputMode="decimal"
            min="0"
            step="0.0001"
          />
        </label>
        <label className="text-xs font-semibold text-content-secondary">
          Cargo fijo
          <Input
            name="fixedFee"
            defaultValue={String(config.fixedFee ?? '0')}
            inputMode="decimal"
            min="0"
            step="0.01"
          />
        </label>
        <label className="text-xs font-semibold text-content-secondary">
          % internacional
          <Input
            name="internationalPercentage"
            defaultValue={String(config.internationalPercentage ?? '0')}
            inputMode="decimal"
            min="0"
            step="0.0001"
          />
        </label>
        <label className="text-xs font-semibold text-content-secondary">
          % conversión
          <Input
            name="conversionPercentage"
            defaultValue={String(config.conversionPercentage ?? '0')}
            inputMode="decimal"
            min="0"
            step="0.0001"
          />
        </label>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input defaultChecked={Boolean(config.active)} name="active" type="checkbox" /> Activa
          </label>
          <Button size="sm" type="submit">
            Guardar
          </Button>
        </div>
      </form>
    </Card>
  );
}
