'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input, Select, Textarea } from '@/components/ui/input';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { JsonRecord } from '@/lib/types';

interface LeadFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  country: string;
  source: string;
  platform: string;
  campaignId: string;
  categoryId: string;
  productId: string;
  assignedUserId: string;
  priority: string;
  probability: string;
  note: string;
  nextFollowUpAt: string;
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="space-y-1 text-sm font-semibold text-content-primary">
      <span>{label}</span>
      {children}
    </label>
  );
}

function toBody(values: LeadFormValues): JsonRecord {
  const optional = (value: string): string | undefined => value.trim() || undefined;
  return {
    ...(optional(values.firstName) ? { firstName: optional(values.firstName) } : {}),
    ...(optional(values.lastName) ? { lastName: optional(values.lastName) } : {}),
    ...(optional(values.phone) ? { phone: optional(values.phone) } : {}),
    ...(optional(values.email) ? { email: optional(values.email) } : {}),
    ...(optional(values.country) ? { country: values.country.trim().toUpperCase() } : {}),
    source: optional(values.source) ?? 'MANUAL',
    ...(optional(values.platform) ? { platform: optional(values.platform) } : {}),
    ...(optional(values.campaignId) ? { campaignId: optional(values.campaignId) } : {}),
    ...(optional(values.categoryId) ? { categoryId: optional(values.categoryId) } : {}),
    ...(optional(values.productId) ? { productId: optional(values.productId) } : {}),
    ...(optional(values.assignedUserId) ? { assignedUserId: optional(values.assignedUserId) } : {}),
    priority: values.priority,
    probability: Number(values.probability),
    ...(optional(values.note) ? { note: optional(values.note) } : {}),
    ...(optional(values.nextFollowUpAt)
      ? { nextFollowUpAt: new Date(values.nextFollowUpAt).toISOString() }
      : {}),
  };
}

export function LeadIntakeDrawer({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): React.ReactElement {
  const form = useForm<LeadFormValues>({
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      country: 'CL',
      source: 'MANUAL',
      platform: '',
      campaignId: '',
      categoryId: '',
      productId: '',
      assignedUserId: '',
      priority: 'NORMAL',
      probability: '50',
      note: '',
      nextFollowUpAt: '',
    },
  });
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductSku, setNewProductSku] = useState('');
  const [newProductType, setNewProductType] = useState('OTHER');
  const [newProductFulfillmentMode, setNewProductFulfillmentMode] = useState('MANUAL');
  const [newProductCurrency, setNewProductCurrency] = useState('USD');
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const categories = useQuery({ queryKey: ['catalog-categories'], queryFn: api.getCategories });
  const products = useQuery({
    queryKey: ['catalog-products', 'lead-intake'],
    queryFn: () => api.getProducts(queryString({ page: 1, limit: 100 })),
  });
  const assignees = useQuery({ queryKey: ['contact-assignees'], queryFn: api.getContactAssignees });
  const campaigns = useQuery({
    queryKey: ['marketing-campaigns', 'lead-intake'],
    queryFn: () => api.getMarketingCampaigns(queryString({ page: 1, limit: 100 })),
  });
  const createCategory = useMutation({
    mutationFn: () => api.createCategory({ name: newCategoryName.trim() }),
    onSuccess: (category) => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
      form.setValue('categoryId', category.id);
      setNewCategoryName('');
      setNewCategoryOpen(false);
      toast({ title: 'Categoría creada', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible crear la categoría',
        description: error.message,
        tone: 'error',
      }),
  });
  const createProduct = useMutation({
    mutationFn: () =>
      api.createProduct({
        name: newProductName.trim(),
        ...(newProductSku.trim() ? { sku: newProductSku.trim() } : {}),
        categoryId: form.getValues('categoryId') || null,
        type: newProductType,
        fulfillmentMode: newProductFulfillmentMode,
        currency: newProductCurrency.trim().toUpperCase(),
        status: 'ACTIVE',
        active: true,
      }),
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-products', 'lead-intake'] });
      form.setValue('productId', product.id);
      setNewProductName('');
      setNewProductSku('');
      setNewProductType('OTHER');
      setNewProductFulfillmentMode('MANUAL');
      setNewProductCurrency('USD');
      setNewProductOpen(false);
      toast({ title: 'Producto creado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible crear el producto',
        description: error.message,
        tone: 'error',
      }),
  });
  const create = useMutation({
    mutationFn: (values: LeadFormValues) => api.createLead(toBody(values)),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-360'] });
      form.reset();
      onClose();
      const reused = result.reusedContact ? ' Se reutilizó el contacto existente.' : '';
      toast({
        title: 'Lead creado',
        description: `La oportunidad quedó en la primera etapa.${reused}`,
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible crear el lead', description: error.message, tone: 'error' }),
  });

  return (
    <Drawer
      description="Registra el contacto y su oportunidad inicial sin perder trazabilidad."
      onClose={onClose}
      open={open}
      title="Nuevo lead"
    >
      <form className="space-y-5" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <Input {...form.register('firstName')} placeholder="Juan" />
          </Field>
          <Field label="Apellido">
            <Input {...form.register('lastName')} placeholder="Pérez" />
          </Field>
          <Field label="Teléfono">
            <Input {...form.register('phone')} placeholder="+56912345678" />
          </Field>
          <Field label="Correo">
            <Input type="email" {...form.register('email')} placeholder="juan@empresa.com" />
          </Field>
          <Field label="País">
            <Input maxLength={2} {...form.register('country')} placeholder="CL" />
          </Field>
          <Field label="Fuente">
            <Input {...form.register('source')} placeholder="META_ADS" />
          </Field>
          <Field label="Plataforma">
            <Input {...form.register('platform')} placeholder="META" />
          </Field>
          <Field label="Responsable">
            <Select {...form.register('assignedUserId')}>
              <option value="">Sin responsable</option>
              {(assignees.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName ?? ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Campaña">
            <Select {...form.register('campaignId')}>
              <option value="">Sin campaña</option>
              {(campaigns.data?.data ?? []).map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoría de interés">
            <Select
              {...form.register('categoryId')}
              onChange={(event) => {
                form.setValue('categoryId', event.target.value);
                form.setValue('productId', '');
              }}
            >
              <option value="">Sin categoría</option>
              {(categories.data ?? [])
                .filter((item) => item.active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </Select>
            <button
              className="text-xs font-bold text-brand-600"
              onClick={() => setNewCategoryOpen((value) => !value)}
              type="button"
            >
              ＋ Nueva categoría
            </button>
            {newCategoryOpen ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Nombre"
                  value={newCategoryName}
                />
                <Button
                  disabled={!newCategoryName.trim() || createCategory.isPending}
                  onClick={() => createCategory.mutate()}
                  size="sm"
                  type="button"
                >
                  Crear
                </Button>
              </div>
            ) : null}
          </Field>
          <Field label="Producto de interés">
            <Select {...form.register('productId')}>
              <option value="">Sin producto</option>
              {(products.data?.data ?? [])
                .filter(
                  (item) =>
                    item.active &&
                    item.status === 'ACTIVE' &&
                    (!form.watch('categoryId') || item.category?.id === form.watch('categoryId')),
                )
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
            </Select>
            <button
              className="text-xs font-bold text-brand-600"
              onClick={() => setNewProductOpen((value) => !value)}
              type="button"
            >
              ＋ Nuevo producto
            </button>
            {newProductOpen ? (
              <div className="grid gap-2 rounded-xl border border-border-subtle bg-surface-inset p-3 sm:grid-cols-2">
                <Input
                  autoFocus
                  onChange={(event) => setNewProductName(event.target.value)}
                  placeholder="Nombre"
                  value={newProductName}
                />
                <Input
                  onChange={(event) => setNewProductSku(event.target.value)}
                  placeholder="SKU (opcional)"
                  value={newProductSku}
                />
                <Select
                  onChange={(event) => setNewProductType(event.target.value)}
                  value={newProductType}
                >
                  <option value="SUBSCRIPTION">Suscripción</option>
                  <option value="CREDIT_PACKAGE">Paquete de créditos</option>
                  <option value="LICENSE">Licencia</option>
                  <option value="SERVICE">Servicio</option>
                  <option value="DIGITAL_ACCESS">Acceso digital</option>
                  <option value="OTHER">Otro</option>
                </Select>
                <Select
                  onChange={(event) => setNewProductFulfillmentMode(event.target.value)}
                  value={newProductFulfillmentMode}
                >
                  <option value="MANUAL">Manual</option>
                  <option value="API">API</option>
                  <option value="INVITATION">Invitación</option>
                  <option value="CREDENTIALS">Credenciales</option>
                  <option value="DOWNLOAD">Descarga</option>
                  <option value="OTHER">Otro</option>
                </Select>
                <Input
                  maxLength={3}
                  onChange={(event) => setNewProductCurrency(event.target.value)}
                  placeholder="Moneda (USD)"
                  value={newProductCurrency}
                />
                <Button
                  disabled={!newProductName.trim() || createProduct.isPending}
                  onClick={() => createProduct.mutate()}
                  size="sm"
                  type="button"
                >
                  Crear
                </Button>
              </div>
            ) : null}
          </Field>
          <Field label="Prioridad">
            <Select {...form.register('priority')}>
              <option value="LOW">Baja</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </Select>
          </Field>
          <Field label="Probabilidad (%)">
            <Input max={100} min={0} type="number" {...form.register('probability')} />
          </Field>
          <Field label="Próximo seguimiento">
            <Input type="datetime-local" {...form.register('nextFollowUpAt')} />
          </Field>
        </div>
        <Field label="Nota inicial">
          <Textarea {...form.register('note')} placeholder="Contexto comercial del lead" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancelar
          </Button>
          <Button disabled={create.isPending} type="submit">
            {create.isPending ? 'Creando…' : 'Crear lead'}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
