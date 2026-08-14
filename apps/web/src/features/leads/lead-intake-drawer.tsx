'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { CreatableCombobox } from '@/components/shared/creatable-combobox';
import { Drawer } from '@/components/ui/drawer';
import { Input, Select, Textarea } from '@/components/ui/input';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { JsonRecord, PipelineStage } from '@/lib/types';

interface LeadFormValues {
  firstName: string;
  phone: string;
  country: string;
  source: string;
  categoryId: string;
  productId: string;
  assignedUserId: string;
  pipelineStageId: string;
  note: string;
  nextFollowUpAt: string;
  estimatedPurchaseAt: string;
}

const STAGE_LABELS: Record<string, string> = {
  NEW: 'No responde',
  NEW_LEAD: 'No responde',
  MESSAGE_SENT: 'Mensaje enviado',
  CONVERSATION: 'Conversando',
  AWAITING_CREDIT_USAGE: 'Conversando',
  WAITING_CUSTOMER: 'No responde',
  LEFT_ON_READ: 'No responde',
  DEMO_SENT: 'Demo enviada',
  DEMO_DELIVERED: 'Demo enviada',
  NO_RESPONSE: 'No responde',
  TALK_LATER: 'Hablar más adelante',
  WANTS_TO_BUY: 'Quiere comprar',
  PURCHASED: 'Compró',
};

const VISIBLE_STAGE_KEYS = new Set([
  'DEMO_SENT',
  'NO_RESPONSE',
  'TALK_LATER',
  'WANTS_TO_BUY',
  'PURCHASED',
  'NEW',
  'NEW_LEAD',
  'NUEVO_LEAD',
  'DEMO_DELIVERED',
  'DEMO_ENTREGADA',
  'LEFT_ON_READ',
  'DEJO_EN_VISTO',
  'WAITING_CUSTOMER',
  'COMPRO',
  'PAID',
  'WON',
]);

const CANONICAL_STAGE_KEYS: Record<string, string> = {
  NEW: 'NO_RESPONSE',
  NEW_LEAD: 'NO_RESPONSE',
  NUEVO_LEAD: 'NO_RESPONSE',
  WAITING_CUSTOMER: 'NO_RESPONSE',
  LEFT_ON_READ: 'NO_RESPONSE',
  DEJO_EN_VISTO: 'NO_RESPONSE',
  DEMO_DELIVERED: 'DEMO_SENT',
  DEMO_ENTREGADA: 'DEMO_SENT',
  COMPRO: 'PURCHASED',
  PAID: 'PURCHASED',
  WON: 'PURCHASED',
};

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

function stageLabel(stage: PipelineStage): string {
  const normalizedName = stage.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '_');
  return STAGE_LABELS[stage.systemKey ?? ''] ?? STAGE_LABELS[normalizedName] ?? stage.name;
}

function suggestedDateTimeLocal(days: number | null): string {
  if (days === null) return '';
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(10, 0, 0, 0);
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T10:00`;
}

function toBody(values: LeadFormValues): JsonRecord {
  const optional = (value: string): string | undefined => value.trim() || undefined;
  return {
    ...(optional(values.firstName) ? { firstName: optional(values.firstName) } : {}),
    ...(optional(values.phone) ? { phone: optional(values.phone) } : {}),
    ...(optional(values.country) ? { country: values.country.trim().toUpperCase() } : {}),
    source: optional(values.source) ?? 'MANUAL',
    ...(optional(values.categoryId) ? { categoryId: optional(values.categoryId) } : {}),
    ...(optional(values.productId) ? { productId: optional(values.productId) } : {}),
    ...(optional(values.assignedUserId) ? { assignedUserId: optional(values.assignedUserId) } : {}),
    ...(optional(values.pipelineStageId)
      ? { pipelineStageId: optional(values.pipelineStageId) }
      : {}),
    ...(optional(values.note) ? { note: optional(values.note) } : {}),
    ...(optional(values.nextFollowUpAt)
      ? { nextFollowUpAt: new Date(values.nextFollowUpAt).toISOString() }
      : {}),
    ...(optional(values.estimatedPurchaseAt)
      ? { estimatedPurchaseAt: new Date(values.estimatedPurchaseAt).toISOString() }
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
      phone: '',
      country: 'CL',
      source: 'MANUAL',
      categoryId: '',
      productId: '',
      assignedUserId: '',
      pipelineStageId: '',
      note: '',
      nextFollowUpAt: '',
      estimatedPurchaseAt: '',
    },
  });
  const [categorySearch, setCategorySearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [followUpAutomatic, setFollowUpAutomatic] = useState(true);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const categoryId = form.watch('categoryId');
  const productId = form.watch('productId');
  const pipelineStageId = form.watch('pipelineStageId');
  const categories = useQuery({ queryKey: ['catalog-categories'], queryFn: api.getCategories });
  const products = useQuery({
    queryKey: ['catalog-products', 'lead-intake'],
    queryFn: () => api.getProducts(queryString({ page: 1, limit: 100 })),
  });
  const assignees = useQuery({ queryKey: ['contact-assignees'], queryFn: api.getContactAssignees });
  const pipeline = useQuery({
    queryKey: ['pipeline', 'lead-intake'],
    queryFn: () => api.getPipeline(queryString({ limit: 100 })),
  });
  const stages = (pipeline.data?.stages ?? []).filter((stage) => stage.active);
  const stateStages = stages.filter((stage) => VISIBLE_STAGE_KEYS.has(stage.systemKey ?? ''));
  const selectedStage = stateStages.find((stage) => stage.id === pipelineStageId);
  const selectedStageKey = selectedStage
    ? (CANONICAL_STAGE_KEYS[selectedStage.systemKey ?? ''] ?? selectedStage.systemKey)
    : undefined;
  const selectedStageId = selectedStage?.id;
  const selectedStageDays = selectedStage?.followUpDays;
  const selectedCategory = (categories.data ?? []).find((item) => item.id === categoryId);
  const selectedProduct = (products.data?.data ?? []).find((item) => item.id === productId);
  const createCategory = useMutation({
    mutationFn: (name: string) => api.createCategoryQuick({ name }),
    onSuccess: (category) => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
      form.setValue('categoryId', category.id);
      form.setValue('productId', '');
      setCategorySearch(category.name);
      setProductSearch('');
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
    mutationFn: (name: string) =>
      api.createProductQuick({
        name,
        categoryId,
        type: 'OTHER',
        fulfillmentMode: 'MANUAL',
        currency: 'USD',
        status: 'ACTIVE',
        active: true,
      }),
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-products', 'lead-intake'] });
      form.setValue('productId', product.id);
      setProductSearch(product.name);
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
    onSuccess: async (result) => {
      const state = typeof result.state === 'string' ? result.state : null;
      const opportunityId = typeof result.opportunityId === 'string' ? result.opportunityId : null;
      if (state === 'PURCHASED' && opportunityId) {
        await api.convertOpportunity(opportunityId);
      }
      void queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-360'] });
      void queryClient.invalidateQueries({ queryKey: ['my-day'] });
      form.reset();
      setCategorySearch('');
      setProductSearch('');
      setFollowUpAutomatic(true);
      onClose();
      const reused = result.reusedContact ? ' Se reutilizó el contacto existente.' : '';
      toast({
        title: 'Lead creado',
        description: `La oportunidad quedó en ${result.state ?? 'la etapa seleccionada'}.${reused}`,
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible crear el lead', description: error.message, tone: 'error' }),
  });

  useEffect(() => {
    if (!pipelineStageId && stateStages[0]) {
      form.setValue('pipelineStageId', stateStages[0].id);
    }
  }, [form, pipelineStageId, stateStages]);

  useEffect(() => {
    if (!selectedStageId) return;
    const key = selectedStageKey;
    if (key === 'DEMO_SENT' || key === 'NO_RESPONSE') {
      setFollowUpAutomatic(true);
      form.setValue('nextFollowUpAt', suggestedDateTimeLocal(selectedStageDays ?? null));
      return;
    }
    setFollowUpAutomatic(false);
    form.setValue('nextFollowUpAt', '');
    if (key !== 'WANTS_TO_BUY') form.setValue('estimatedPurchaseAt', '');
  }, [form, selectedStage, selectedStageDays, selectedStageId, selectedStageKey]);

  const categoryOptions = (categories.data ?? [])
    .filter((item) => item.active)
    .map((item) => ({ id: item.id, label: item.name }));
  const productOptions = (products.data?.data ?? [])
    .filter(
      (item) =>
        item.active &&
        item.status === 'ACTIVE' &&
        (!categoryId || item.category?.id === categoryId),
    )
    .map((item) => ({ id: item.id, label: item.name, secondary: item.sku ?? undefined }));
  return (
    <Drawer
      description="Registra el contacto y su oportunidad inicial sin perder trazabilidad."
      onClose={onClose}
      open={open}
      title="Registrar Lead"
    >
      <form className="space-y-5" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <Input autoFocus {...form.register('firstName')} placeholder="Juan" />
          </Field>
          <Field label="Teléfono">
            <Input {...form.register('phone')} placeholder="+56912345678" />
          </Field>
          <Field label="País">
            <Input maxLength={2} {...form.register('country')} placeholder="CL" />
          </Field>
          <Field label="Fuente">
            <Input {...form.register('source')} placeholder="MANUAL" />
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
          <Field label="Estado comercial">
            <Select {...form.register('pipelineStageId')}>
              <option value="">Seleccionar estado</option>
              {stateStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stageLabel(stage)}
                </option>
              ))}
            </Select>
          </Field>
          <CreatableCombobox
            createLabel="Crear categoría"
            emptyLabel="Sin categoría"
            label="Categoría"
            onCreate={(name) => {
              createCategory.mutate(name);
            }}
            onSearch={setCategorySearch}
            onSelect={(option) => {
              form.setValue('categoryId', option?.id ?? '');
              form.setValue('productId', '');
              setProductSearch('');
            }}
            options={categoryOptions}
            placeholder="Buscar o crear categoría..."
            search={categorySearch}
            selectedLabel={selectedCategory?.name}
          />
          <div className="-mt-3 sm:col-start-2">
            <button
              className="text-xs font-bold text-brand-600"
              onClick={() => setNewCategoryOpen((value) => !value)}
              type="button"
            >
              ＋ Nueva categoría
            </button>
            {newCategoryOpen ? (
              <div className="mt-2 flex gap-2">
                <Input
                  autoFocus
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Nombre"
                  value={newCategoryName}
                />
                <Button
                  disabled={!newCategoryName.trim() || createCategory.isPending}
                  onClick={() => createCategory.mutate(newCategoryName.trim())}
                  size="sm"
                  type="button"
                >
                  Crear
                </Button>
              </div>
            ) : null}
          </div>
          <CreatableCombobox
            createLabel="Crear producto"
            emptyLabel="Sin producto"
            label="Producto"
            onCreate={(name) => {
              if (!categoryId) {
                toast({ title: 'Selecciona una categoría primero', tone: 'error' });
                return;
              }
              createProduct.mutate(name);
            }}
            onSearch={setProductSearch}
            onSelect={(option) => form.setValue('productId', option?.id ?? '')}
            options={productOptions}
            placeholder={categoryId ? 'Buscar o crear producto...' : 'Selecciona categoría primero'}
            search={productSearch}
            selectedLabel={selectedProduct?.name}
          />
          {selectedStageKey !== 'PURCHASED' ? (
            <Field
              label={
                selectedStageKey === 'TALK_LATER' || selectedStageKey === 'WANTS_TO_BUY'
                  ? 'Seguimiento manual *'
                  : 'Próximo seguimiento'
              }
            >
              <Input
                required={!followUpAutomatic}
                type="datetime-local"
                {...form.register('nextFollowUpAt', {
                  onChange: () => setFollowUpAutomatic(false),
                })}
              />
              <span className="text-xs font-normal text-content-muted">
                {followUpAutomatic
                  ? 'Sugerido a las 10:00; puedes modificarlo.'
                  : 'Selecciona la fecha y hora del próximo contacto.'}
              </span>
            </Field>
          ) : null}
          {selectedStageKey === 'WANTS_TO_BUY' ? (
            <Field label="Fecha estimada de compra *">
              <Input required type="datetime-local" {...form.register('estimatedPurchaseAt')} />
            </Field>
          ) : null}
        </div>
        <Field label="Nota inicial">
          <Textarea {...form.register('note')} placeholder="Contexto comercial del lead" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancelar
          </Button>
          <Button
            disabled={
              create.isPending ||
              createCategory.isPending ||
              createProduct.isPending ||
              (selectedStageKey === 'PURCHASED' && !productId)
            }
            type="submit"
          >
            {create.isPending
              ? 'Registrando…'
              : selectedStageKey === 'PURCHASED'
                ? 'Completar venta'
                : 'Registrar Lead'}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
