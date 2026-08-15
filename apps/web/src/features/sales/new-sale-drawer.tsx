'use client';

import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { CreatableCombobox } from '@/components/shared/creatable-combobox';
import { Drawer } from '@/components/ui/drawer';
import { Input, Select, Textarea } from '@/components/ui/input';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { JsonRecord } from '@/lib/types';

interface SaleFormValues {
  contactId: string;
  productId: string;
  planId: string;
  subscriptionDurationDays: string;
  quantity: string;
  currency: string;
  note: string;
  paymentMethod: string;
  paidNow: boolean;
  paymentAmount: string;
  unitPrice: string;
}

export function NewSaleDrawer({
  open,
  onClose,
  defaultContactId = '',
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly defaultContactId?: string;
}): React.ReactElement {
  const form = useForm<SaleFormValues>({
    defaultValues: {
      contactId: '',
      productId: '',
      planId: '',
      subscriptionDurationDays: '30',
      quantity: '1',
      currency: 'USD',
      note: '',
      paymentMethod: 'MANUAL',
      paidNow: false,
      paymentAmount: '',
      unitPrice: '',
    },
  });
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const [contactSearch, setContactSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  useEffect(() => {
    if (open && defaultContactId) form.setValue('contactId', defaultContactId);
  }, [defaultContactId, form, open]);
  const contacts = useQuery({
    queryKey: ['contacts', 'new-sale', contactSearch],
    queryFn: () =>
      api.getContacts(queryString({ page: 1, limit: 50, search: contactSearch || undefined })),
  });
  const offers = useQuery({
    queryKey: ['catalog-offers', 'new-sale'],
    queryFn: () => api.getOffers('?limit=100'),
  });
  const selectedOffer = (offers.data?.data ?? []).find(
    (offer) => offer.id === form.watch('productId'),
  );
  const visibleOffers = (offers.data?.data ?? []).filter(
    (offer) => !offer.stock.trackingEnabled || offer.stock.available > 0,
  );
  const selectedContact = (contacts.data?.data ?? []).find(
    (contact) => contact.id === form.watch('contactId'),
  );
  const selectedPlan = (selectedOffer?.plans ?? []).find(
    (plan) => typeof plan.id === 'string' && plan.id === form.watch('planId'),
  );
  const create = useMutation({
    mutationFn: async (values: SaleFormValues) => {
      const body: JsonRecord = {
        contactId: values.contactId,
        currency: values.currency.trim().toUpperCase(),
        items: [
          {
            productId: values.productId,
            ...(values.planId ? { planId: values.planId } : {}),
            quantity: values.quantity,
            ...(values.unitPrice.trim() ? { unitPrice: values.unitPrice.trim() } : {}),
            ...(selectedOffer?.type === 'SUBSCRIPTION' || selectedOffer?.requiresSubscription
              ? { subscriptionDurationDays: Number(values.subscriptionDurationDays) }
              : {}),
          },
        ],
        ...(values.note.trim() ? { note: values.note.trim() } : {}),
      };
      const sale = await api.createSale(body);
      if (values.paidNow) {
        const confirmedSale = sale.status === 'DRAFT' ? await api.confirmSale(sale.id) : sale;
        const payment = await api.createPayment(confirmedSale.id, {
          amount: values.paymentAmount.trim() || confirmedSale.total,
          currency: confirmedSale.currency,
          method: values.paymentMethod,
        });
        if (typeof payment.id === 'string') await api.confirmPayment(payment.id);
      }
      return sale;
    },
    onSuccess: (_sale, values) => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
      void queryClient.invalidateQueries({ queryKey: ['executive-dashboard'] });
      form.reset();
      setContactSearch('');
      setProductSearch('');
      onClose();
      toast({
        title: 'Venta creada',
        description: values.paidNow
          ? 'La venta fue confirmada y el pago quedó registrado.'
          : 'Se creó como borrador para revisión.',
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible crear la venta', description: error.message, tone: 'error' }),
  });
  return (
    <Drawer
      description="Selecciona un cliente y un producto del catálogo. El backend crea el snapshot comercial."
      onClose={onClose}
      open={open}
      title="Nueva venta"
    >
      <form className="space-y-5" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
        <CreatableCombobox
          createLabel="Crear cliente rápido"
          emptyLabel="Limpiar cliente"
          isLoading={contacts.isFetching}
          label="Cliente"
          onCreate={(value) => {
            const [firstName, ...lastName] = value.trim().split(/\s+/);
            void api
              .createContact({
                firstName,
                ...(lastName.length ? { lastName: lastName.join(' ') } : {}),
                country: 'CL',
                source: 'MANUAL',
              })
              .then((contact) => {
                form.setValue('contactId', contact.id);
                setContactSearch(contact.displayName ?? value);
                void queryClient.invalidateQueries({ queryKey: ['contacts', 'new-sale'] });
              })
              .catch((error: unknown) =>
                toast({
                  title: 'No fue posible crear el cliente',
                  description: error instanceof Error ? error.message : 'Revisa los datos.',
                  tone: 'error',
                }),
              );
          }}
          onSearch={setContactSearch}
          onSelect={(option) => form.setValue('contactId', option?.id ?? '')}
          options={(contacts.data?.data ?? []).map((contact) => ({
            id: contact.id,
            label: contact.displayName ?? contact.firstName ?? contact.phone ?? 'Cliente',
            secondary: [contact.phone, contact.country].filter(Boolean).join(' · '),
          }))}
          placeholder="Buscar por nombre o teléfono"
          search={contactSearch}
          selectedLabel={selectedContact?.displayName ?? undefined}
        />
        <CreatableCombobox
          createLabel="Crear producto"
          emptyLabel="Limpiar producto"
          label="Producto"
          onSearch={setProductSearch}
          onSelect={(option) => {
            form.setValue('productId', option?.id ?? '');
            form.setValue('planId', '');
            const offer = visibleOffers.find((item) => item.id === option?.id);
            form.setValue('unitPrice', offer?.price?.amount ?? '');
          }}
          options={visibleOffers.map((offer) => ({
            id: offer.id,
            label: offer.name,
            secondary: [
              offer.category?.name,
              offer.sku,
              offer.price?.currency,
              offer.price?.amount,
              offer.stock.trackingEnabled ? `stock ${offer.stock.available}` : 'stock ilimitado',
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
          placeholder="Buscar producto, categoría o SKU"
          search={productSearch}
          selectedLabel={selectedOffer?.name}
        />
        {(selectedOffer?.plans?.length ?? 0) > 0 ? (
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Plan</span>
            <Select {...form.register('planId')}>
              <option value="">Seleccionar plan</option>
              {(selectedOffer?.plans ?? []).map((plan) =>
                typeof plan.id === 'string' ? (
                  <option key={plan.id} value={plan.id}>
                    {typeof plan.name === 'string' ? plan.name : plan.id}
                  </option>
                ) : null,
              )}
            </Select>
            {selectedPlan && typeof selectedPlan.name === 'string' ? (
              <span className="text-xs font-normal text-content-muted">{selectedPlan.name}</span>
            ) : null}
          </label>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Precio</span>
            <Input
              {...form.register('unitPrice')}
              value={form.watch('unitPrice') || selectedOffer?.price?.amount || ''}
            />
          </label>
          {selectedOffer?.type === 'SUBSCRIPTION' || selectedOffer?.requiresSubscription ? (
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Duración de suscripción</span>
              <Select {...form.register('subscriptionDurationDays')}>
                <option value="30">30 días</option>
                <option value="90">3 meses</option>
                <option value="180">6 meses</option>
                <option value="365">12 meses</option>
              </Select>
            </label>
          ) : null}
          {selectedOffer?.stock?.trackingEnabled ? (
            <p className="text-xs text-content-muted">
              Stock disponible: {selectedOffer.stock.available}
            </p>
          ) : null}
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Cantidad</span>
            <Input
              min={1}
              step="0.001"
              type="number"
              {...form.register('quantity', { required: true })}
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Moneda</span>
            <Input maxLength={3} {...form.register('currency', { required: true })} />
          </label>
        </div>
        <label className="space-y-1 text-sm font-semibold text-content-primary">
          <span>Método de pago</span>
          <Select {...form.register('paymentMethod')}>
            <option value="TRANSFER">Transferencia</option>
            <option value="PAYPAL">PayPal</option>
            <option value="BINANCE">Binance</option>
            <option value="MERCADOPAGO">Mercado Pago</option>
            <option value="STRIPE">Stripe</option>
            <option value="CASH">Efectivo</option>
            <option value="MANUAL">Manual</option>
            <option value="OTHER">Otro</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-content-primary">
          <input type="checkbox" {...form.register('paidNow')} /> Pagó ahora
        </label>
        {form.watch('paidNow') ? (
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Monto pagado</span>
            <Input
              inputMode="decimal"
              placeholder="Total completo si queda vacío"
              {...form.register('paymentAmount')}
            />
          </label>
        ) : null}
        <label className="space-y-1 text-sm font-semibold text-content-primary">
          <span>Nota</span>
          <Textarea {...form.register('note')} />
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancelar
          </Button>
          <Button disabled={create.isPending} type="submit">
            {create.isPending ? 'Creando…' : 'Crear borrador'}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
