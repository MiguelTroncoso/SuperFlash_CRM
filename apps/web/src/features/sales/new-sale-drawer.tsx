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
import type { JsonRecord, PricingOption } from '@/lib/types';
import { useAuthStore } from '@/lib/auth-store';

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
  priceBookEntryId: string;
  discountAmount: string;
  paymentDueAt: string;
  priceOverrideReason: string;
}

interface SaleSubmission {
  values: SaleFormValues;
  confirm: boolean;
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
      priceBookEntryId: '',
      discountAmount: '',
      paymentDueAt: '',
      priceOverrideReason: '',
    },
  });
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const canOverridePrice = useAuthStore((state) =>
    Boolean(state.user?.permissions.includes('catalog.prices.override')),
  );
  const [contactSearch, setContactSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickCountry, setQuickCountry] = useState('CL');
  const [pricingSelectionKey, setPricingSelectionKey] = useState('');
  useEffect(() => {
    if (open && defaultContactId) form.setValue('contactId', defaultContactId);
  }, [defaultContactId, form, open]);
  const contacts = useQuery({
    queryKey: ['contacts', 'new-sale', contactSearch],
    queryFn: () =>
      api.getContacts(queryString({ page: 1, limit: 50, search: contactSearch || undefined })),
  });
  const offers = useQuery({
    queryKey: ['catalog-offers', 'new-sale', productSearch],
    queryFn: () =>
      api.getOffers(
        queryString({
          customerSegment: 'ANY',
          search: productSearch.trim() || undefined,
          limit: 100,
        }),
      ),
  });
  const selectedOffer = (offers.data?.data ?? []).find(
    (offer) => offer.id === form.watch('productId'),
  );
  const visibleOffers = offers.data?.data ?? [];
  const selectedContact = (contacts.data?.data ?? []).find(
    (contact) => contact.id === form.watch('contactId'),
  );
  const selectedPlan = (selectedOffer?.plans ?? []).find(
    (plan) => typeof plan.id === 'string' && plan.id === form.watch('planId'),
  );
  const pricingOptions: PricingOption[] = selectedPlan?.pricingOptions?.length
    ? selectedPlan.pricingOptions
    : (selectedOffer?.pricingOptions ?? []);
  const selectedPricingOption = pricingOptions.find(
    (option) => `${option.priceBookEntryId ?? 'legacy'}:${option.currency}` === pricingSelectionKey,
  );
  const hasValidPrice = Number(form.watch('unitPrice') || 0) > 0;
  const canCreateSale = Boolean(
    form.watch('contactId') && selectedOffer && selectedOffer.selectable && hasValidPrice,
  );
  const applyPricingOption = (
    option: PricingOption | undefined,
    defaultCurrency?: string | null,
  ): void => {
    if (!option) {
      setPricingSelectionKey('');
      form.setValue('priceBookEntryId', '');
      form.setValue('unitPrice', '');
      if (defaultCurrency) form.setValue('currency', defaultCurrency);
      return;
    }
    setPricingSelectionKey(`${option.priceBookEntryId ?? 'legacy'}:${option.currency}`);
    form.setValue('priceBookEntryId', option.priceBookEntryId ?? '');
    form.setValue('currency', option.currency);
    form.setValue('unitPrice', option.amount);
  };
  const subtotal =
    Math.max(Number(form.watch('quantity') || 0), 0) *
    Math.max(Number(form.watch('unitPrice') || 0), 0);
  const create = useMutation({
    mutationFn: async ({ values, confirm }: SaleSubmission) => {
      if (!values.contactId || !values.productId) {
        throw new Error('Selecciona un cliente y un producto antes de continuar.');
      }
      const body: JsonRecord = {
        contactId: values.contactId,
        currency: values.currency.trim().toUpperCase(),
        items: [
          {
            productId: values.productId,
            ...(values.planId ? { planId: values.planId } : {}),
            ...(values.priceBookEntryId ? { priceBookEntryId: values.priceBookEntryId } : {}),
            quantity: values.quantity,
            ...(values.unitPrice.trim() ? { unitPrice: values.unitPrice.trim() } : {}),
            ...(values.priceOverrideReason.trim()
              ? { priceOverrideReason: values.priceOverrideReason.trim() }
              : {}),
            ...(selectedOffer?.type === 'SUBSCRIPTION' || selectedOffer?.requiresSubscription
              ? { subscriptionDurationDays: Number(values.subscriptionDurationDays) }
              : {}),
          },
        ],
        ...(values.discountAmount.trim() ? { discountAmount: values.discountAmount.trim() } : {}),
        ...(values.paymentDueAt
          ? { paymentDueAt: new Date(`${values.paymentDueAt}T23:59:59.000Z`).toISOString() }
          : {}),
        ...(values.note.trim() ? { note: values.note.trim() } : {}),
      };
      const sale = await api.createSale(body);
      let result = sale;
      if (confirm) {
        const confirmedSale =
          sale.status === 'DRAFT'
            ? await api.confirmSale(
                sale.id,
                values.paidNow
                  ? {
                      payment: {
                        amount: values.paymentAmount.trim() || sale.total,
                        currency: sale.currency,
                        method: values.paymentMethod,
                      },
                    }
                  : undefined,
              )
            : sale;
        result = confirmedSale;
      }
      return { sale: result, confirmed: confirm };
    },
    onSuccess: ({ confirmed }, { values }) => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
      void queryClient.invalidateQueries({ queryKey: ['executive-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-offers'] });
      void queryClient.invalidateQueries({ queryKey: ['operational-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['renewal-center'] });
      void queryClient.invalidateQueries({ queryKey: ['my-day'] });
      form.reset();
      setContactSearch('');
      setProductSearch('');
      setQuickPhone('');
      setQuickCountry('CL');
      setPricingSelectionKey('');
      onClose();
      toast({
        title: confirmed ? 'Venta confirmada' : 'Borrador guardado',
        description:
          confirmed && values.paidNow
            ? 'La venta, el stock y el pago quedaron registrados.'
            : confirmed
              ? 'La venta, el stock y las renovaciones quedaron registradas.'
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
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit((values) => create.mutate({ values, confirm: false }))}
      >
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
                ...(quickPhone.trim() ? { phone: quickPhone.trim() } : {}),
                country: quickCountry,
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
        <div className="grid gap-3 rounded-xl border border-border-subtle bg-surface-muted p-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-content-secondary">
            <span>Teléfono cliente rápido (opcional)</span>
            <Input
              value={quickPhone}
              onChange={(event) => setQuickPhone(event.target.value)}
              placeholder="+56912345678"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold text-content-secondary">
            <span>País cliente rápido</span>
            <Select value={quickCountry} onChange={(event) => setQuickCountry(event.target.value)}>
              <option value="CL">Chile</option>
              <option value="MX">México</option>
              <option value="PE">Perú</option>
              <option value="US">Estados Unidos</option>
            </Select>
          </label>
        </div>
        <CreatableCombobox
          createLabel="Crear producto"
          emptyLabel="Limpiar producto"
          label="Producto"
          onSearch={setProductSearch}
          onSelect={(option) => {
            form.setValue('productId', option?.id ?? '');
            form.setValue('planId', '');
            const offer = (offers.data?.data ?? []).find((item) => item.id === option?.id);
            applyPricingOption(offer?.pricingOptions[0], offer?.currency);
          }}
          options={visibleOffers.map((offer) => ({
            id: offer.id,
            label: offer.name,
            secondary: [
              offer.category?.name,
              offer.sku,
              offer.pricingOptions.length
                ? offer.pricingOptions
                    .map((option) => `${option.currency} ${option.amount}`)
                    .join(' · ')
                : offer.availabilityStatus === 'NO_STOCK'
                  ? 'Sin stock'
                  : 'Sin precio configurado',
              offer.stock.trackingEnabled ? `stock ${offer.stock.available}` : 'stock ilimitado',
            ]
              .filter(Boolean)
              .join(' · '),
            disabled: !offer.selectable,
          }))}
          placeholder="Buscar producto, categoría o SKU"
          search={productSearch}
          selectedLabel={selectedOffer?.name}
        />
        {(selectedOffer?.plans?.length ?? 0) > 0 ? (
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Plan</span>
            <Select
              value={form.watch('planId')}
              onChange={(event) => {
                form.setValue('planId', event.target.value);
                const plan = (selectedOffer?.plans ?? []).find(
                  (item) => item.id === event.target.value,
                );
                applyPricingOption(plan?.pricingOptions[0], selectedOffer?.currency);
              }}
            >
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
        {pricingOptions.length > 1 ? (
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Precio disponible</span>
            <Select
              value={pricingSelectionKey}
              onChange={(event) =>
                applyPricingOption(
                  pricingOptions.find(
                    (option) =>
                      `${option.priceBookEntryId ?? 'legacy'}:${option.currency}` ===
                      event.target.value,
                  ),
                )
              }
            >
              {pricingOptions.map((option) => {
                const key = `${option.priceBookEntryId ?? 'legacy'}:${option.currency}`;
                return (
                  <option key={key} value={key}>
                    {option.currency} {option.amount}
                  </option>
                );
              })}
            </Select>
          </label>
        ) : null}
        {selectedOffer?.availabilityStatus === 'NO_STOCK' ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            Sin stock disponible para este producto.
          </p>
        ) : null}
        {selectedOffer?.availabilityStatus === 'NO_PRICE' && !canOverridePrice ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            Sin precio configurado. No se puede confirmar la venta.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Precio</span>
            <Input
              {...form.register('unitPrice')}
              disabled={!canOverridePrice}
              value={form.watch('unitPrice') || selectedPricingOption?.amount || ''}
            />
          </label>
          {canOverridePrice ? (
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Motivo del precio manual</span>
              <Input placeholder="Opcional" {...form.register('priceOverrideReason')} />
            </label>
          ) : null}
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
          <div className="rounded-xl border border-border-subtle bg-surface-muted p-3 text-sm text-content-secondary sm:col-span-2">
            Subtotal:{' '}
            <strong className="text-content-primary">
              {form.watch('currency').toUpperCase()}{' '}
              {subtotal.toLocaleString('es-CL', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </div>
          <label className="space-y-1 text-sm font-semibold text-content-primary sm:col-span-2">
            <span>Descuento</span>
            <Input inputMode="decimal" min="0" step="0.01" {...form.register('discountAmount')} />
          </label>
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Moneda</span>
            <Select
              value={form.watch('currency')}
              onChange={(event) => {
                const option = pricingOptions.find((item) => item.currency === event.target.value);
                if (option) applyPricingOption(option);
                else form.setValue('currency', event.target.value);
              }}
            >
              {(pricingOptions.length
                ? pricingOptions.map((option) => option.currency)
                : ['USD', 'CLP', 'MXN', 'PEN', 'EUR']
              )
                .filter((currency, index, values) => values.indexOf(currency) === index)
                .map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Fecha compromiso de pago</span>
            <Input type="date" {...form.register('paymentDueAt')} />
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
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            Cancelar
          </Button>
          <Button disabled={create.isPending || !canCreateSale} type="submit" variant="outline">
            {create.isPending ? 'Guardando…' : 'Guardar borrador'}
          </Button>
          <Button
            disabled={create.isPending || !canCreateSale}
            onClick={() =>
              void form.handleSubmit((values) => create.mutate({ values, confirm: true }))()
            }
            type="button"
          >
            {create.isPending ? 'Confirmando…' : 'Confirmar venta'}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
