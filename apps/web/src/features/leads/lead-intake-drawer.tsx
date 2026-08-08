'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
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
}

interface ComboboxOption {
  id: string;
  label: string;
  secondary?: string | undefined;
}

const STAGE_LABELS: Record<string, string> = {
  NEW: 'Nuevo',
  NEW_LEAD: 'Nuevo',
  MESSAGE_SENT: 'Mensaje enviado',
  CONVERSATION: 'Conversando',
  AWAITING_CREDIT_USAGE: 'Conversando',
  WAITING_CUSTOMER: 'Esperando respuesta',
  LEFT_ON_READ: 'Esperando respuesta',
  DEMO_SENT: 'Demo enviada',
  DEMO_DELIVERED: 'Demo enviada',
  INTERESTED: 'Interesado',
  POTENTIAL_BUYER: 'Interesado',
  PAYMENT_PENDING: 'Debe pagar',
  AWAITING_MONEY: 'Debe pagar',
  PAID: 'Pagó',
  WON: 'Pagó',
  ACTIVATING: 'Activando',
  ACTIVE: 'Activo',
  LOST: 'Perdido',
  FUTURE_REACTIVATION: 'Reactivar',
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

function toOperationalSystemKey(value: string): string {
  const key = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70);
  return `CUSTOM_${key || 'STATE'}`;
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
  };
}

function CreatableCombobox({
  label,
  placeholder,
  search,
  options,
  selectedLabel,
  onSearch,
  onSelect,
  onCreate,
  createLabel,
  emptyLabel,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly search: string;
  readonly options: ComboboxOption[];
  readonly selectedLabel?: string | undefined;
  readonly onSearch: (value: string) => void;
  readonly onSelect: (option: ComboboxOption | null) => void;
  readonly onCreate?: (value: string) => void;
  readonly createLabel: string;
  readonly emptyLabel: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = options.filter((option) =>
    `${option.label} ${option.secondary ?? ''}`.toLocaleLowerCase().includes(normalizedSearch),
  );
  const exact = options.some((option) => option.label.toLocaleLowerCase() === normalizedSearch);

  useEffect(() => {
    const close = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div className="relative space-y-1" ref={root}>
      <span className="block text-sm font-semibold text-content-primary">{label}</span>
      <Input
        aria-expanded={open}
        aria-label={label}
        autoComplete="off"
        onChange={(event) => {
          onSearch(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        role="combobox"
        value={search}
      />
      {open ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border-subtle bg-surface-raised p-1 shadow-xl">
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-content-muted hover:bg-surface-inset"
            onClick={() => {
              onSelect(null);
              onSearch('');
              setOpen(false);
            }}
            type="button"
          >
            {emptyLabel}
          </button>
          {filtered.map((option) => (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-content-primary hover:bg-surface-inset"
              key={option.id}
              onClick={() => {
                onSelect(option);
                onSearch(option.label);
                setOpen(false);
              }}
              type="button"
            >
              <span className="block font-semibold">{option.label}</span>
              {option.secondary ? (
                <span className="block text-xs text-content-muted">{option.secondary}</span>
              ) : null}
            </button>
          ))}
          {onCreate && search.trim() && !exact ? (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10"
              onClick={() => {
                onCreate(search.trim());
                setOpen(false);
              }}
              type="button"
            >
              ＋ {createLabel} “{search.trim()}”
            </button>
          ) : null}
          {!filtered.length && !onCreate ? (
            <p className="px-3 py-2 text-xs text-content-muted">No hay coincidencias.</p>
          ) : null}
        </div>
      ) : null}
      {selectedLabel && selectedLabel !== search ? (
        <span className="block text-xs text-content-muted">Seleccionado: {selectedLabel}</span>
      ) : null}
    </div>
  );
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
    },
  });
  const [categorySearch, setCategorySearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [stateSearch, setStateSearch] = useState('');
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
  const selectedStage = stages.find((stage) => stage.id === pipelineStageId);
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
  const createState = useMutation({
    mutationFn: (name: string) =>
      api.createPipelineStage({
        name,
        systemKey: toOperationalSystemKey(name),
        color: '#64748B',
        category: 'OPEN',
        order: stages.length + 1,
      }),
    onSuccess: (stage) => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline', 'lead-intake'] });
      form.setValue('pipelineStageId', stage.id);
      setStateSearch(stageLabel(stage));
      toast({ title: 'Estado creado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible crear el estado', description: error.message, tone: 'error' }),
  });
  const create = useMutation({
    mutationFn: (values: LeadFormValues) => api.createLead(toBody(values)),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-360'] });
      void queryClient.invalidateQueries({ queryKey: ['my-day'] });
      form.reset();
      setCategorySearch('');
      setProductSearch('');
      setStateSearch('');
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
    if (!pipelineStageId && stages[0]) {
      form.setValue('pipelineStageId', stages[0].id);
      setStateSearch(stageLabel(stages[0]));
    }
  }, [form, pipelineStageId, stages]);

  useEffect(() => {
    if (!selectedStageId || !followUpAutomatic) return;
    const days = selectedStageDays === undefined ? 2 : selectedStageDays;
    form.setValue('nextFollowUpAt', suggestedDateTimeLocal(days));
  }, [form, followUpAutomatic, selectedStageDays, selectedStageId]);

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
  const stateOptions = stages.map((stage) => ({
    id: stage.id,
    label: stageLabel(stage),
    secondary: stage.systemKey?.startsWith('CUSTOM_') ? 'Estado personalizado' : undefined,
  }));

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
          <CreatableCombobox
            createLabel="Crear estado"
            emptyLabel="Sin estado seleccionado"
            label="Estado comercial"
            onCreate={(name) => {
              createState.mutate(name);
            }}
            onSearch={setStateSearch}
            onSelect={(option) => {
              form.setValue('pipelineStageId', option?.id ?? '');
              if (option) setStateSearch(option.label);
            }}
            options={stateOptions}
            placeholder="Buscar estado..."
            search={stateSearch}
            selectedLabel={selectedStage ? stageLabel(selectedStage) : undefined}
          />
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
          <Field label="Próximo seguimiento">
            <Input
              type="datetime-local"
              {...form.register('nextFollowUpAt', {
                onChange: () => setFollowUpAutomatic(false),
              })}
            />
            <span className="text-xs font-normal text-content-muted">
              Se sugiere a las 10:00 en la zona horaria operativa; puedes cambiarlo manualmente.
            </span>
          </Field>
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
              createState.isPending
            }
            type="submit"
          >
            {create.isPending ? 'Registrando…' : 'Registrar Lead'}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
