'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';

import { PageHeader, PageGrid } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SearchBar } from '@/components/ui/search-bar';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { NewSaleDrawer } from '@/features/sales/new-sale-drawer';
import { api, queryString } from '@/lib/api-client';
import type { Sale } from '@/lib/types';

function formatDate(value: string | null | undefined): string {
  return value
    ? new Date(value).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })
    : '—';
}

function formatSubscriptionDuration(days: number | null): string {
  if (days === 30) return '30 días';
  if (days === 90) return '3 meses';
  if (days === 180) return '6 meses';
  if (days === 365) return '12 meses';
  return 'Según ciclo';
}

function itemRequiresSubscription(item: Record<string, unknown>): boolean {
  const snapshot = item.catalogSnapshot;
  return (
    typeof snapshot === 'object' &&
    snapshot !== null &&
    Boolean((snapshot as Record<string, unknown>).requiresSubscription)
  );
}

export function SalesPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Sale | null>(null);
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editValues, setEditValues] = useState({
    unitPrice: '',
    discountAmount: '',
    paymentDueAt: '',
    paymentMethod: 'MANUAL',
    paidNow: false,
    note: '',
    subscriptionDurationDays: '',
    priceOverrideReason: '',
  });
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const sales = useQuery({
    queryKey: ['sales', page, search],
    queryFn: () => api.getSales(queryString({ page, limit: 25, search })),
  });
  const saleId = searchParams.get('saleId');
  const linkedSale = useQuery({
    queryKey: ['sales', 'detail', saleId],
    queryFn: () => api.getSale(saleId as string),
    enabled: Boolean(saleId),
  });
  useEffect(() => {
    if (linkedSale.data) setSelected(linkedSale.data);
  }, [linkedSale.data]);
  const confirm = async (): Promise<void> => {
    if (!selected) return;
    setConfirming(true);
    try {
      const updated = await api.confirmSale(selected.id);
      setSelected(updated);
      await queryClient.invalidateQueries({ queryKey: ['sales'] });
    } catch (error: unknown) {
      useToastStore.getState().push({
        title: 'No fue posible confirmar',
        description: error instanceof Error ? error.message : 'Error inesperado.',
        tone: 'error',
      });
    } finally {
      setConfirming(false);
    }
  };
  const update = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Venta no seleccionada.');
      const item = selected.items[0] as Record<string, unknown> | undefined;
      return api.updateSale(selected.id, {
        ...(item?.id && editValues.unitPrice
          ? { itemId: String(item.id), unitPrice: editValues.unitPrice }
          : {}),
        discountAmount: editValues.discountAmount || '0',
        paymentDueAt:
          editValues.paidNow || !editValues.paymentDueAt
            ? null
            : `${editValues.paymentDueAt}T12:00:00.000Z`,
        paymentMethod: editValues.paymentMethod,
        paidNow: editValues.paidNow,
        note: editValues.note,
        ...(editValues.subscriptionDurationDays
          ? { subscriptionDurationDays: Number(editValues.subscriptionDurationDays) }
          : {}),
        ...(editValues.priceOverrideReason
          ? { priceOverrideReason: editValues.priceOverrideReason }
          : {}),
      });
    },
    onSuccess: (sale) => {
      setSelected(sale);
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({ title: 'Venta actualizada', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible editar la venta', description: error.message, tone: 'error' }),
  });
  const remove = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Venta no seleccionada.');
      return api.deleteSale(selected.id);
    },
    onSuccess: () => {
      setDeleting(false);
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['my-day'] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Venta eliminada',
        description: 'Stock y colas operativas fueron reconciliados.',
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({ title: 'No se puede eliminar la venta', description: error.message, tone: 'error' }),
  });
  const openEditor = (): void => {
    if (!selected) return;
    const item = selected.items[0] as Record<string, unknown> | undefined;
    const subscription = selected.subscriptions?.[0];
    setEditValues({
      unitPrice: String(item?.unitPrice ?? ''),
      discountAmount: selected.discountAmount,
      paymentDueAt: selected.paymentDueAt?.slice(0, 10) ?? '',
      paymentMethod: selected.paymentMethod ?? 'MANUAL',
      paidNow: selected.paidNow ?? false,
      note: selected.note ?? '',
      subscriptionDurationDays: subscription?.durationDays ? String(subscription.durationDays) : '',
      priceOverrideReason: '',
    });
    setEditing(true);
  };
  const columns: ColumnDef<Sale, unknown>[] = [
    {
      accessorKey: 'id',
      header: 'Venta',
      cell: ({ row }) => (
        <button
          className="font-mono text-xs font-bold text-brand-600"
          onClick={() => setSelected(row.original)}
          type="button"
        >
          #{row.original.id.slice(0, 8)}
        </button>
      ),
    },
    {
      accessorKey: 'contact',
      header: 'Cliente',
      cell: ({ row }) => (
        <span className="font-semibold">{row.original.contact?.name ?? 'Sin contacto'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => (
        <span className="font-bold">
          {row.original.currency} {row.original.total}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Creada',
      cell: ({ row }) => (
        <span className="text-xs text-slate-400">
          {new Date(row.original.createdAt).toLocaleDateString('es-CL')}
        </span>
      ),
    },
  ];
  return (
    <QueryState
      isError={sales.isError || linkedSale.isError}
      isLoading={sales.isLoading || linkedSale.isLoading}
      onRetry={() => void Promise.all([sales.refetch(), linkedSale.refetch()])}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Commercial core"
          title="Ventas"
          description="Crea la venta, registra el pago y deja el saldo claro en un solo drawer."
          actions={
            <Button className="px-6 py-3 text-base" onClick={() => setNewSaleOpen(true)} size="lg">
              ＋ Nueva Venta
            </Button>
          }
        />
        <SearchBar
          className="max-w-sm"
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder="Buscar por cliente o referencia"
          value={search}
        />
        <Card>
          <DataTable
            columns={columns}
            data={sales.data?.data ?? []}
            emptyDescription="Las ventas creadas desde oportunidades aparecerán en este listado."
            emptyTitle="No hay ventas"
            virtualize
          />
          <Pagination
            onPageChange={setPage}
            page={page}
            totalPages={sales.data?.pagination.totalPages ?? 1}
          />
        </Card>
        <Drawer
          description="Detalle de la venta y su snapshot comercial."
          onClose={() => setSelected(null)}
          open={Boolean(selected)}
          title={selected ? `Venta #${selected.id.slice(0, 8)}` : 'Venta'}
        >
          {selected ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface-inset p-4">
                  <p className="text-xs text-slate-400">Estado</p>
                  <div className="mt-2">
                    <StatusBadge status={selected.status} />
                  </div>
                </div>
                <div className="rounded-xl bg-surface-inset p-4">
                  <p className="text-xs text-slate-400">Total</p>
                  <p className="mt-2 text-lg font-bold">
                    {selected.currency} {selected.total}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Cliente</p>
                <p className="mt-2 text-sm font-semibold">
                  {selected.contact?.name ?? 'Sin contacto'}
                </p>
              </div>
              {(selected.subscriptions ?? []).length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Suscripciones
                  </p>
                  {(selected.subscriptions ?? []).map((subscription) => (
                    <div
                      className="rounded-xl border border-border-subtle bg-surface-muted p-4 text-sm"
                      key={subscription.id}
                    >
                      <p className="font-semibold text-content-primary">
                        {subscription.productName}
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <dt className="text-content-muted">Duración</dt>
                          <dd className="mt-1 font-semibold text-content-primary">
                            {formatSubscriptionDuration(subscription.durationDays)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-content-muted">Inicio</dt>
                          <dd className="mt-1 font-semibold text-content-primary">
                            {formatDate(subscription.startsAt)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-content-muted">Vencimiento</dt>
                          <dd className="mt-1 font-semibold text-content-primary">
                            {formatDate(subscription.currentPeriodEnd)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-content-muted">Próxima renovación</dt>
                          <dd className="mt-1 font-semibold text-content-primary">
                            {formatDate(subscription.renewal?.dueAt ?? subscription.nextBillingAt)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              ) : null}
              {selected.status === 'DRAFT' ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={openEditor} variant="outline">
                    Editar
                  </Button>
                  <Button disabled={confirming} onClick={() => void confirm()}>
                    {confirming ? 'Confirmando…' : 'Confirmar venta'}
                  </Button>
                  <Button onClick={() => setDeleting(true)} variant="danger">
                    Eliminar
                  </Button>
                </div>
              ) : null}
              {selected.status !== 'DRAFT' && selected.status !== 'CANCELLED' ? (
                <Button onClick={() => setDeleting(true)} variant="danger">
                  Eliminar venta
                </Button>
              ) : null}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Notas</p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  La información detallada se mantiene en el backend y se muestra sin exponer datos
                  internos.
                </p>
              </div>
            </div>
          ) : null}
        </Drawer>
        <Drawer
          description="Solo se editan ventas en borrador o pendientes; las confirmadas conservan su snapshot económico."
          onClose={() => setEditing(false)}
          open={editing}
          title="Editar venta"
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate();
            }}
          >
            <label className="block space-y-1 text-sm font-semibold text-content-primary">
              <span>Precio del ítem</span>
              <Input
                inputMode="decimal"
                min="0"
                step="0.01"
                value={editValues.unitPrice}
                onChange={(event) =>
                  setEditValues((current) => ({ ...current, unitPrice: event.target.value }))
                }
              />
            </label>
            <label className="block space-y-1 text-sm font-semibold text-content-primary">
              <span>Descuento</span>
              <Input
                inputMode="decimal"
                min="0"
                step="0.01"
                value={editValues.discountAmount}
                onChange={(event) =>
                  setEditValues((current) => ({ ...current, discountAmount: event.target.value }))
                }
              />
            </label>
            <label className="block space-y-1 text-sm font-semibold text-content-primary">
              <span>Método de pago</span>
              <Select
                value={editValues.paymentMethod}
                onChange={(event) =>
                  setEditValues((current) => ({ ...current, paymentMethod: event.target.value }))
                }
              >
                {[
                  'TRANSFER',
                  'PAYPAL',
                  'BINANCE',
                  'MERCADOPAGO',
                  'STRIPE',
                  'CASH',
                  'MANUAL',
                  'OTHER',
                ].map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-content-primary">
              <input
                checked={editValues.paidNow}
                onChange={(event) =>
                  setEditValues((current) => ({
                    ...current,
                    paidNow: event.target.checked,
                    paymentDueAt: event.target.checked ? '' : current.paymentDueAt,
                  }))
                }
                type="checkbox"
              />{' '}
              Pagó ahora
            </label>
            {!editValues.paidNow ? (
              <label className="block space-y-1 text-sm font-semibold text-content-primary">
                <span>Fecha compromiso</span>
                <Input
                  type="date"
                  value={editValues.paymentDueAt}
                  onChange={(event) =>
                    setEditValues((current) => ({ ...current, paymentDueAt: event.target.value }))
                  }
                />
              </label>
            ) : null}
            {selected &&
            (selected.items.some(itemRequiresSubscription) ||
              Boolean(selected.subscriptions?.length)) ? (
              <label className="block space-y-1 text-sm font-semibold text-content-primary">
                <span>Duración</span>
                <Select
                  value={editValues.subscriptionDurationDays}
                  onChange={(event) =>
                    setEditValues((current) => ({
                      ...current,
                      subscriptionDurationDays: event.target.value,
                    }))
                  }
                >
                  <option value="">Según catálogo</option>
                  <option value="30">30 días</option>
                  <option value="90">3 meses</option>
                  <option value="180">6 meses</option>
                  <option value="365">12 meses</option>
                </Select>
              </label>
            ) : null}
            <label className="block space-y-1 text-sm font-semibold text-content-primary">
              <span>Motivo precio manual</span>
              <Input
                value={editValues.priceOverrideReason}
                onChange={(event) =>
                  setEditValues((current) => ({
                    ...current,
                    priceOverrideReason: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block space-y-1 text-sm font-semibold text-content-primary">
              <span>Notas</span>
              <Textarea
                value={editValues.note}
                onChange={(event) =>
                  setEditValues((current) => ({ ...current, note: event.target.value }))
                }
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditing(false)} type="button" variant="outline">
                Cancelar
              </Button>
              <Button disabled={update.isPending} type="submit">
                {update.isPending ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        </Drawer>
        <ConfirmDialog
          confirmLabel="Eliminar venta"
          description="La venta se archivará, se cancelarán sus renovaciones y suscripciones, y se revertirá el stock descontado. Los pagos netos deben estar en cero."
          onClose={() => setDeleting(false)}
          onConfirm={() => remove.mutate()}
          open={deleting}
          title="Eliminar venta"
        />
      </PageGrid>
      <NewSaleDrawer
        defaultContactId={searchParams.get('contactId') ?? ''}
        onClose={() => setNewSaleOpen(false)}
        open={newSaleOpen}
      />
    </QueryState>
  );
}
