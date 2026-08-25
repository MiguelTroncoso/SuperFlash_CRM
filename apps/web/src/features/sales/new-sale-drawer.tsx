'use client';

import { useForm } from 'react-hook-form';
import { addSubscriptionDuration, COUNTRIES } from '@superflash/utils';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { CreatableCombobox } from '@/components/shared/creatable-combobox';
import { Drawer } from '@/components/ui/drawer';
import { Input, Select, Textarea } from '@/components/ui/input';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { JsonRecord, PricingOption } from '@/lib/types';
import { useAuthStore } from '@/lib/auth-store';
import { useDebounce } from '@/hooks/use-debounce';

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

function formatDate(value: Date): string {
  return value.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Santiago',
  });
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
      paymentMethod: 'TRANSFER',
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
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [quickFirstName, setQuickFirstName] = useState('');
  const [quickLastName, setQuickLastName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickCountry, setQuickCountry] = useState('CL');
  const [pricingSelectionKey, setPricingSelectionKey] = useState('');

  const debouncedContactSearch = useDebounce(contactSearch, 300);
  const debouncedProductSearch = useDebounce(productSearch, 300);

  useEffect(() => {
    if (open && defaultContactId) form.setValue('contactId', defaultContactId);
  }, [defaultContactId, form, open]);

  const contacts = useQuery({
    queryKey: ['contacts', 'new-sale', debouncedContactSearch],
    queryFn: () =>
      api.getContacts(
        queryString({
          page: 1,
          limit: 50,
          search:
            debouncedContactSearch.trim().length >= 2 ? debouncedContactSearch.trim() : undefined,
        }),
      ),
    enabled: open,
  });

  const offers = useQuery({
    queryKey: ['catalog-offers', 'new-sale', debouncedProductSearch],
    queryFn: () =>
      api.getOffers(
        queryString({
          customerSegment: 'ANY',
          search: debouncedProductSearch.trim() || undefined,
          limit: 100,
        }),
      ),
    enabled: open,
  });

  const commissions = useQuery({
    queryKey: ['payment-commissions'],
    queryFn: api.getCommissionConfigs,
    enabled: open,
  });

  const exchangeRates = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: api.getExchangeRates,
    enabled: open,
  });

  const selectedOffer = (offers.data?.data ?? []).find(
    (offer) => offer.id === form.watch('productId'),
  );
  const isSubscription = Boolean(
    selectedOffer?.type === 'SUBSCRIPTION' || selectedOffer?.requiresSubscription,
  );
  const subscriptionDurationDays = Number(form.watch('subscriptionDurationDays'));
  const subscriptionStartAt = useMemo(() => new Date(), []);
  const estimatedSubscriptionEnd =
    isSubscription && [30, 90, 180, 365].includes(subscriptionDurationDays)
      ? addSubscriptionDuration(subscriptionStartAt, subscriptionDurationDays)
      : null;
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
  const saleTotal = Math.max(subtotal - Math.max(Number(form.watch('discountAmount') || 0), 0), 0);
  const paidNow = form.watch('paidNow');
  const paymentAmount = form.watch('paymentAmount').trim();
  const paymentCoversTotal =
    paidNow && saleTotal > 0 && (!paymentAmount || Number(paymentAmount) >= saleTotal);

  const paymentMethod = form.watch('paymentMethod');
  const isPaypal = paymentMethod === 'PAYPAL';
  const currentCurrency = form.watch('currency').toUpperCase();
  const chargedAmount = Number(paymentAmount.trim() || saleTotal || 0);

  const paypalConfig = (commissions.data ?? []).find((c) => c.method === 'PAYPAL');
  const paypalPercentage = Number(paypalConfig?.percentage ?? 4.95);
  const paypalFixedFee = Number(paypalConfig?.fixedFee ?? 0.49);

  // In sale currency
  const estimatedPaypalFee =
    chargedAmount > 0 ? (chargedAmount * paypalPercentage) / 100 + paypalFixedFee : 0;
  const estimatedPaypalNet = Math.max(0, chargedAmount - estimatedPaypalFee);

  // FX for non-USD
  const currencyRateRecord = (exchangeRates.data ?? []).find(
    (r) =>
      String(r.fromCurrency).toUpperCase() === currentCurrency &&
      String(r.toCurrency).toUpperCase() === 'USD',
  );
  const fxRate = currencyRateRecord
    ? Number(currencyRateRecord.rate)
    : currentCurrency === 'USD' || currentCurrency === 'USDT'
      ? 1
      : null;
  const chargedUsd = fxRate ? chargedAmount * fxRate : null;
  const paypalFeeUsd = chargedUsd ? (chargedUsd * paypalPercentage) / 100 + paypalFixedFee : null;
  const paypalNetUsd = chargedUsd && paypalFeeUsd ? Math.max(0, chargedUsd - paypalFeeUsd) : null;

  useEffect(() => {
    if (paymentCoversTotal && form.getValues('paymentDueAt')) {
      form.setValue('paymentDueAt', '');
    }
  }, [form, paymentCoversTotal]);

  const create = useMutation({
    mutationFn: async ({ values, confirm }: SaleSubmission) => {
      if (!values.contactId || !values.productId) {
        throw new Error('Selecciona un cliente y un producto antes de continuar.');
      }
      const body: JsonRecord = {
        contactId: values.contactId,
        currency: values.currency.trim().toUpperCase(),
        confirm,
        paidNow: values.paidNow,
        paymentMethod: values.paymentMethod,
        ...(values.paidNow && values.paymentAmount.trim()
          ? { paymentAmount: values.paymentAmount.trim() }
          : {}),
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
            ...(isSubscription
              ? { subscriptionDurationDays: Number(values.subscriptionDurationDays) }
              : {}),
          },
        ],
        ...(values.discountAmount.trim() ? { discountAmount: values.discountAmount.trim() } : {}),
        ...(values.paymentDueAt && !values.paidNow
          ? { paymentDueAt: new Date(`${values.paymentDueAt}T23:59:59.000Z`).toISOString() }
          : {}),
        ...(values.note.trim() ? { note: values.note.trim() } : {}),
      };
      const sale = await api.createSale(body);
      return { sale, confirmed: confirm };
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
        {selectedContact ? (
          <div className="flex items-center justify-between rounded-xl border border-brand-500/20 bg-brand-50/50 p-3 dark:bg-brand-950/20">
            <div>
              <p className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                Cliente seleccionado
              </p>
              <p className="text-sm font-bold text-content-primary">
                {selectedContact.displayName ??
                  selectedContact.firstName ??
                  selectedContact.phone ??
                  'Cliente'}
              </p>
              <p className="text-xs text-content-muted">
                {[selectedContact.phone, selectedContact.country].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Button
              onClick={() => {
                form.setValue('contactId', '');
                setContactSearch('');
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Cambiar cliente
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <CreatableCombobox
              createLabel="Crear cliente rápido"
              emptyLabel=""
              isLoading={contacts.isFetching}
              label="Cliente"
              onCreate={(value) => {
                const [first, ...rest] = value.trim().split(/\s+/);
                setQuickFirstName(first ?? '');
                setQuickLastName(rest.join(' '));
                setShowQuickClient(true);
              }}
              onSearch={setContactSearch}
              onSelect={(option) => form.setValue('contactId', option?.id ?? '')}
              options={(contacts.data?.data ?? []).map((contact) => ({
                id: contact.id,
                label: contact.displayName ?? contact.firstName ?? contact.phone ?? 'Cliente',
                secondary: [contact.phone, contact.country].filter(Boolean).join(' · '),
              }))}
              placeholder="Buscar por nombre o teléfono (ej. Reseller, Juan)"
              search={contactSearch}
            />
            {showQuickClient ? (
              <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-muted p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-content-primary">
                    Crear cliente rápido
                  </span>
                  <button
                    className="text-xs text-content-muted hover:text-content-primary"
                    onClick={() => setShowQuickClient(false)}
                    type="button"
                  >
                    Cancelar
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-semibold text-content-secondary">
                    <span>Nombre</span>
                    <Input
                      onChange={(event) => setQuickFirstName(event.target.value)}
                      placeholder="Nombre"
                      value={quickFirstName}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-content-secondary">
                    <span>Apellido (opcional)</span>
                    <Input
                      onChange={(event) => setQuickLastName(event.target.value)}
                      placeholder="Apellido"
                      value={quickLastName}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-content-secondary">
                    <span>Teléfono (opcional)</span>
                    <Input
                      onChange={(event) => setQuickPhone(event.target.value)}
                      placeholder="+56912345678"
                      value={quickPhone}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-content-secondary">
                    <span>País</span>
                    <Select
                      onChange={(event) => setQuickCountry(event.target.value)}
                      value={quickCountry}
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.name} ({c.dialCode})
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
                <Button
                  className="w-full"
                  disabled={!quickFirstName.trim()}
                  onClick={() => {
                    void api
                      .createContact({
                        firstName: quickFirstName.trim(),
                        ...(quickLastName.trim() ? { lastName: quickLastName.trim() } : {}),
                        ...(quickPhone.trim() ? { phone: quickPhone.trim() } : {}),
                        country: quickCountry,
                        source: 'MANUAL',
                      })
                      .then((contact) => {
                        form.setValue('contactId', contact.id);
                        setContactSearch('');
                        setShowQuickClient(false);
                        setQuickFirstName('');
                        setQuickLastName('');
                        setQuickPhone('');
                        void queryClient.invalidateQueries({ queryKey: ['contacts', 'new-sale'] });
                        toast({ title: 'Cliente creado', tone: 'success' });
                      })
                      .catch((error: unknown) =>
                        toast({
                          title: 'No fue posible crear el cliente',
                          description: error instanceof Error ? error.message : 'Revisa los datos.',
                          tone: 'error',
                        }),
                      );
                  }}
                  size="sm"
                  type="button"
                >
                  Guardar cliente y continuar
                </Button>
              </div>
            ) : null}
          </div>
        )}
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
                    {typeof plan.name === 'string' ? plan.name : 'Plan comercial'}
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
          {isSubscription ? (
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Duración de suscripción</span>
              <Select {...form.register('subscriptionDurationDays')}>
                <option value="30">30 días</option>
                <option value="90">3 meses</option>
                <option value="180">6 meses</option>
                <option value="365">12 meses</option>
              </Select>
              {estimatedSubscriptionEnd ? (
                <span className="block rounded-xl border border-border-subtle bg-surface-muted p-3 text-xs font-normal text-content-secondary">
                  <span className="block">
                    Inicio de suscripción: {formatDate(subscriptionStartAt)}
                  </span>
                  <span className="mt-1 block font-semibold text-content-primary">
                    Vencimiento estimado: {formatDate(estimatedSubscriptionEnd)}
                  </span>
                </span>
              ) : null}
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
            <span>Descuento comercial</span>
            <Input inputMode="decimal" min="0" step="0.01" {...form.register('discountAmount')} />
          </label>
          <div className="rounded-xl border border-brand-500/20 bg-brand-50/30 p-3 text-sm text-content-primary sm:col-span-2 dark:bg-brand-950/20">
            Total de venta:{' '}
            <strong className="text-base text-brand-600 dark:text-brand-400">
              {form.watch('currency').toUpperCase()}{' '}
              {saleTotal.toLocaleString('es-CL', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </div>
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
                : ['USD', 'CLP', 'MXN', 'PEN', 'EUR', 'BRL', 'COP']
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
            <span>Método de pago</span>
            <Select {...form.register('paymentMethod')}>
              <option value="TRANSFER">Transferencia bancaria</option>
              <option value="PAYPAL">PayPal</option>
              <option value="BINANCE">Binance / USDT</option>
              <option value="CASH">Efectivo</option>
              <option value="OTHER">Otro</option>
            </Select>
          </label>
        </div>
        <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-muted p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-content-primary">
            <input type="checkbox" {...form.register('paidNow')} /> Pagó ahora
          </label>
          {form.watch('paidNow') ? (
            <div className="space-y-3">
              <label className="space-y-1 text-sm font-semibold text-content-primary">
                <span>Monto pagado</span>
                <Input
                  aria-label="Monto pagado"
                  inputMode="decimal"
                  placeholder={`Total completo (${form.watch('currency')} ${saleTotal.toFixed(2)}) si queda vacío`}
                  {...form.register('paymentAmount')}
                />
              </label>
              {isPaypal ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-950 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200 space-y-2">
                  <div className="flex items-center justify-between font-bold">
                    <span>RESUMEN PAYPAL</span>
                    <span className="text-[10px] font-normal text-blue-700 dark:text-blue-300">
                      (Fee: {paypalPercentage}% + ${paypalFixedFee.toFixed(2)} USD)
                    </span>
                  </div>
                  <div className="space-y-1 pt-1 border-t border-blue-200/60 dark:border-blue-800/40">
                    <div className="flex justify-between">
                      <span>Total cobrado:</span>
                      <span className="font-semibold">
                        {currentCurrency} {chargedAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-amber-700 dark:text-amber-300 font-medium">
                      <span>Comisión PayPal estimada:</span>
                      <span>
                        - {currentCurrency} {estimatedPaypalFee.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-700 dark:text-emerald-300 pt-1 border-t border-blue-200/40 dark:border-blue-800/30">
                      <span>Neto estimado:</span>
                      <span>
                        {currentCurrency} {estimatedPaypalNet.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {currentCurrency !== 'USD' && fxRate ? (
                    <div className="mt-2 pt-2 border-t border-blue-200/60 dark:border-blue-800/40 text-[11px] text-blue-800 dark:text-blue-300 space-y-0.5">
                      <p className="font-semibold">Conversión USD (Consolidado):</p>
                      <div className="flex justify-between">
                        <span>Tasa FX ({currentCurrency}→USD):</span>
                        <span>{fxRate.toFixed(6)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Equivalente USD Bruto:</span>
                        <span>US$ {chargedUsd?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-amber-700 dark:text-amber-300">
                        <span>Comisión PayPal USD:</span>
                        <span>- US$ {paypalFeeUsd?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-emerald-700 dark:text-emerald-300">
                        <span>Neto USD:</span>
                        <span>US$ {paypalNetUsd?.toFixed(2)}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {!paymentCoversTotal ? (
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Fecha compromiso de pago</span>
              <Input type="date" {...form.register('paymentDueAt')} />
            </label>
          ) : null}
        </div>
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
