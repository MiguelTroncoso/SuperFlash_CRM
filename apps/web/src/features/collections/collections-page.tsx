'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { JsonRecord, Sale } from '@/lib/types';

const METHODS = [
  ['TRANSFER', 'Transferencia'],
  ['PAYPAL', 'PayPal'],
  ['BINANCE', 'Binance'],
  ['MERCADOPAGO', 'Mercado Pago'],
  ['STRIPE', 'Stripe'],
  ['CASH', 'Efectivo'],
  ['MANUAL', 'Manual'],
  ['OTHER', 'Otro'],
] as const;

interface PaymentFormValues {
  amount: string;
  feeAmount: string;
  method: string;
}

function amount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(currency: string, value: number): string {
  return `${currency} ${value.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PaymentDrawer({
  sale,
  balance,
  open,
  onClose,
}: {
  readonly sale: Sale | null;
  readonly balance: number;
  readonly open: boolean;
  readonly onClose: () => void;
}): React.ReactElement {
  const form = useForm<PaymentFormValues>({
    defaultValues: { amount: '', feeAmount: '', method: 'MANUAL' },
  });
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const registerPayment = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!sale) throw new Error('Venta no seleccionada.');
      const payment = await api.createPayment(sale.id, {
        amount: values.amount,
        ...(values.feeAmount.trim() ? { feeAmount: values.feeAmount.trim() } : {}),
        currency: sale.currency,
        method: values.method,
      });
      if (typeof payment.id === 'string') await api.confirmPayment(payment.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      form.reset();
      onClose();
      toast({ title: 'Pago registrado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible registrar el pago',
        description: error.message,
        tone: 'error',
      }),
  });
  return (
    <Drawer
      description="El pago se crea, confirma y queda auditado en el backend."
      onClose={onClose}
      open={open}
      title="Registrar pago"
    >
      {sale ? (
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => registerPayment.mutate(values))}
        >
          <div className="rounded-xl bg-surface-inset p-4 text-sm">
            <p className="font-bold text-content-primary">{sale.contact?.name ?? 'Cliente'}</p>
            <p className="mt-1 text-content-secondary">Saldo: {money(sale.currency, balance)}</p>
          </div>
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Monto</span>
            <Input
              autoFocus
              inputMode="decimal"
              max={balance}
              min={0.01}
              step="0.01"
              {...form.register('amount', { required: true })}
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Método</span>
            <Select {...form.register('method')}>
              {METHODS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Comisión del medio (opcional)</span>
            <Input inputMode="decimal" min={0} step="0.01" {...form.register('feeAmount')} />
          </label>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={registerPayment.isPending} type="submit">
              {registerPayment.isPending ? 'Guardando…' : 'Registrar pago'}
            </Button>
          </div>
        </form>
      ) : null}
    </Drawer>
  );
}

export function CollectionsPage(): React.ReactElement {
  const [selected, setSelected] = useState<Sale | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const sales = useQuery({
    queryKey: ['collections', 'sales'],
    queryFn: () => api.getSales(queryString({ page: 1, limit: 100 })),
  });
  const payments = useQuery({
    queryKey: ['collections', 'payments'],
    queryFn: () => api.getPayments(queryString({ page: 1, limit: 100 })),
  });
  const payFull = useMutation({
    mutationFn: async (sale: Sale) => {
      const balance = saleBalance(sale, payments.data?.data ?? []);
      const payment = await api.createPayment(sale.id, {
        amount: balance.toFixed(2),
        currency: sale.currency,
        method: 'MANUAL',
      });
      if (typeof payment.id === 'string') await api.confirmPayment(payment.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({ title: 'Venta marcada como pagada', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible marcar pagado', description: error.message, tone: 'error' }),
  });
  const records = (sales.data?.data ?? [])
    .filter((sale) => sale.status === 'CONFIRMED' || sale.status === 'FULFILLED')
    .map((sale) => ({ sale, balance: saleBalance(sale, payments.data?.data ?? []) }))
    .filter((row) => row.balance > 0.009);
  return (
    <QueryState
      isError={sales.isError || payments.isError}
      isLoading={sales.isLoading || payments.isLoading}
      onRetry={() => void Promise.all([sales.refetch(), payments.refetch()])}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Operación comercial"
          title="Cobros"
          description="Registra pagos y elimina saldos pendientes sin salir del flujo de venta."
        />
        <Card className="overflow-hidden">
          {records.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[780px] w-full text-left text-sm">
                <thead className="bg-surface-muted text-xs uppercase tracking-wide text-content-muted">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Monto pendiente</th>
                    <th className="px-4 py-3">Fecha compromiso</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {records.map(({ sale, balance }) => (
                    <tr key={sale.id}>
                      <td className="px-4 py-3 font-semibold text-content-primary">
                        {sale.contact?.name ?? 'Cliente sin nombre'}
                      </td>
                      <td className="px-4 py-3 font-bold text-content-primary">
                        {money(sale.currency, balance)}
                      </td>
                      <td className="px-4 py-3 text-content-secondary">
                        {new Date(sale.createdAt).toLocaleDateString('es-CL')}
                      </td>
                      <td className="px-4 py-3 text-content-secondary">Pendiente</td>
                      <td className="px-4 py-3">
                        <StatusBadge status="PENDING" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => {
                              setSelected(sale);
                              setPaymentOpen(true);
                            }}
                            size="sm"
                          >
                            Registrar pago
                          </Button>
                          <Button
                            disabled={payFull.isPending}
                            onClick={() => payFull.mutate(sale)}
                            size="sm"
                            variant="outline"
                          >
                            Marcar pagado
                          </Button>
                          {sale.contact ? (
                            <a
                              className="inline-flex items-center rounded-xl px-2 py-2 text-xs font-bold text-brand-600 hover:bg-surface-muted"
                              href={`/customers/${sale.contact.id}`}
                            >
                              Recordatorio
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              description="Las ventas confirmadas sin saldo pendiente no aparecen aquí."
              title="No hay cobros pendientes"
            />
          )}
        </Card>
      </PageGrid>
      <PaymentDrawer
        balance={selected ? saleBalance(selected, payments.data?.data ?? []) : 0}
        onClose={() => {
          setPaymentOpen(false);
          setSelected(null);
        }}
        open={paymentOpen}
        sale={selected}
      />
    </QueryState>
  );
}

function saleBalance(sale: Sale, payments: JsonRecord[]): number {
  const paid = payments
    .filter(
      (payment) =>
        payment.saleId === sale.id &&
        (payment.status === 'CONFIRMED' || payment.status === 'REFUNDED'),
    )
    .reduce(
      (total, payment) =>
        total +
        amount(String(payment.netAmount ?? 0)) -
        amount(String(payment.refundedAmount ?? 0)),
      0,
    );
  return Math.max(amount(sale.total) - paid, 0);
}
