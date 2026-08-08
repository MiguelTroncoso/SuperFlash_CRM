'use client';

import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input, Select, Textarea } from '@/components/ui/input';
import { useToastStore } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import type { JsonRecord } from '@/lib/types';

interface SaleFormValues {
  contactId: string;
  productId: string;
  quantity: string;
  currency: string;
  note: string;
  paymentMethod: string;
  paidNow: boolean;
  paymentAmount: string;
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
      quantity: '1',
      currency: 'USD',
      note: '',
      paymentMethod: 'MANUAL',
      paidNow: false,
      paymentAmount: '',
    },
  });
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  useEffect(() => {
    if (open && defaultContactId) form.setValue('contactId', defaultContactId);
  }, [defaultContactId, form, open]);
  const contacts = useQuery({
    queryKey: ['contacts', 'new-sale'],
    queryFn: () => api.getContacts('?page=1&limit=100'),
  });
  const offers = useQuery({
    queryKey: ['catalog-offers', 'new-sale'],
    queryFn: () => api.getOffers('?limit=100'),
  });
  const selectedOffer = (offers.data?.data ?? []).find(
    (offer) => offer.id === form.watch('productId'),
  );
  const create = useMutation({
    mutationFn: async (values: SaleFormValues) => {
      const body: JsonRecord = {
        contactId: values.contactId,
        currency: values.currency.trim().toUpperCase(),
        items: [{ productId: values.productId, quantity: values.quantity }],
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
        <label className="space-y-1 text-sm font-semibold text-content-primary">
          <span>Cliente</span>
          <Select autoFocus {...form.register('contactId', { required: true })}>
            <option value="">Seleccionar contacto</option>
            {(contacts.data?.data ?? []).map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.displayName ?? contact.email ?? contact.phone ?? contact.id.slice(0, 8)}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-sm font-semibold text-content-primary">
          <span>Producto</span>
          <Select {...form.register('productId', { required: true })}>
            <option value="">Seleccionar producto</option>
            {(offers.data?.data ?? []).map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.name}
                {offer.price?.amount
                  ? ` · ${offer.price.currency ?? ''} ${offer.price.amount}`
                  : ''}
              </option>
            ))}
          </Select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Precio</span>
            <Input
              readOnly
              value={
                selectedOffer?.price?.amount
                  ? `${selectedOffer.price.currency ?? form.watch('currency')} ${selectedOffer.price.amount}`
                  : 'Se calculará al guardar'
              }
            />
          </label>
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
