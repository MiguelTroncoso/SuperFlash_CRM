'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { PermissionGate } from '@/components/ui/permission-gate';
import { SearchBar } from '@/components/ui/search-bar';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { Product, Provider } from '@/lib/types';

function ProviderForm({
  provider,
  onSubmit,
  onCancel,
  submitting,
}: {
  readonly provider: Provider | null;
  readonly onSubmit: (body: Record<string, unknown>) => void;
  readonly onCancel: () => void;
  readonly submitting: boolean;
}): React.ReactElement {
  const form = useForm({
    defaultValues: {
      name: '',
      slug: '',
      type: 'MANUAL',
      fulfillmentMode: 'MANUAL',
      apiBaseUrl: '',
      notes: '',
    },
  });
  useEffect(() => {
    form.reset({
      name: provider?.name ?? '',
      slug: provider?.slug ?? '',
      type: provider?.type ?? 'MANUAL',
      fulfillmentMode: provider?.fulfillmentMode ?? 'MANUAL',
      apiBaseUrl: provider?.apiBaseUrl ?? '',
      notes: provider?.notes ?? '',
    });
  }, [form, provider]);
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({ ...values, apiBaseUrl: values.apiBaseUrl || undefined }),
      )}
    >
      <label className="block space-y-1 text-sm font-semibold">
        Nombre
        <Input {...form.register('name', { required: true, maxLength: 160 })} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">
          Tipo
          <Select {...form.register('type')}>
            {['MANUAL', 'API', 'PANEL', 'INVENTORY', 'DIGITAL_DELIVERY', 'OTHER'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-sm font-semibold">
          Modo
          <Select {...form.register('fulfillmentMode')}>
            {['MANUAL', 'AUTOMATIC', 'HYBRID', 'DIGITAL_DELIVERY'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </label>
      </div>
      <label className="block space-y-1 text-sm font-semibold">
        Slug
        <Input {...form.register('slug')} />
      </label>
      <label className="block space-y-1 text-sm font-semibold">
        API base URL (opcional)
        <Input {...form.register('apiBaseUrl')} placeholder="https://..." />
      </label>
      <label className="block space-y-1 text-sm font-semibold">
        Notas
        <Textarea {...form.register('notes')} />
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={submitting} type="submit">
          Guardar provider
        </Button>
      </div>
    </form>
  );
}

function MappingForm({
  provider,
  products,
  onSubmit,
  onCancel,
  submitting,
}: {
  readonly provider: Provider;
  readonly products: Product[];
  readonly onSubmit: (body: Record<string, unknown>) => void;
  readonly onCancel: () => void;
  readonly submitting: boolean;
}): React.ReactElement {
  const form = useForm({
    defaultValues: { productId: products[0]?.id ?? '', externalProductId: '', priority: 0 },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({ ...values, providerId: provider.id, priority: Number(values.priority) }),
      )}
    >
      <p className="text-xs text-slate-500">No se ejecutan APIs externas desde esta pantalla.</p>
      <label className="block space-y-1 text-sm font-semibold">
        Producto
        <Select {...form.register('productId')}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="block space-y-1 text-sm font-semibold">
        ID externo
        <Input {...form.register('externalProductId')} />
      </label>
      <label className="block space-y-1 text-sm font-semibold">
        Prioridad
        <Input min={0} type="number" {...form.register('priority')} />
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={submitting} type="submit">
          Guardar mapping
        </Button>
      </div>
    </form>
  );
}

export function ProvidersPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Provider | null>(null);
  const [drawer, setDrawer] = useState<'provider' | 'mapping' | null>(null);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const providers = useQuery({
    queryKey: ['providers', page, search],
    queryFn: () => api.getProviders(queryString({ page, limit: 25, search })),
  });
  const products = useQuery({
    queryKey: ['catalog-products-for-providers'],
    queryFn: () => api.getProducts(queryString({ page: 1, limit: 100 })),
  });
  const mappings = useQuery({
    queryKey: ['provider-mappings', selected?.id],
    queryFn: () => api.getProviderMappings(queryString({ providerId: selected?.id })),
    enabled: Boolean(selected?.id),
  });
  const save = useMutation({
    mutationFn: (input: { id?: string; body: Record<string, unknown> }) =>
      input.id ? api.updateProvider(input.id, input.body) : api.createProvider(input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
      setDrawer(null);
      toast({ title: 'Provider guardado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible guardar', description: error.message, tone: 'error' }),
  });
  const mapping = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.createProviderMapping(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['provider-mappings', selected?.id] });
      setDrawer(null);
      toast({ title: 'Mapping guardado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible guardar mapping', description: error.message, tone: 'error' }),
  });
  const status = useMutation({
    mutationFn: (input: { id: string; value: string }) =>
      api.changeProviderStatus(input.id, input.value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
      toast({ title: 'Estado actualizado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible cambiar estado', description: error.message, tone: 'error' }),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.archiveProvider(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
      toast({ title: 'Provider archivado', tone: 'success' });
    },
  });
  const close = (): void => setDrawer(null);
  return (
    <QueryState
      isError={providers.isError}
      isLoading={providers.isLoading}
      onRetry={() => void providers.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Operaciones"
          title="Providers"
          description="Gestiona fuentes de entrega, prioridad y mappings de catálogo."
          actions={
            <PermissionGate permission="providers.create">
              <Button
                onClick={() => {
                  setSelected(null);
                  setDrawer('provider');
                }}
              >
                Nuevo provider
              </Button>
            </PermissionGate>
          }
        />
        <SearchBar
          className="max-w-sm"
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder="Buscar provider..."
          value={search}
        />
        <Card>
          <CardHeader>
            <CardTitle>Fuentes operativas</CardTitle>
            <CardDescription>
              El estado controla si pueden recibir nuevas asignaciones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(providers.data?.data ?? []).map((provider) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                  key={provider.id}
                >
                  <div>
                    <p className="font-bold">{provider.name}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {provider.slug} · {provider.type} · {provider.fulfillmentMode}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={provider.status} />
                    <PermissionGate permission="providers.update">
                      <Button
                        onClick={() => {
                          setSelected(provider);
                          setDrawer('provider');
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Editar
                      </Button>
                      <Button
                        onClick={() => {
                          setSelected(provider);
                          setDrawer('mapping');
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Productos
                      </Button>
                      <Button
                        onClick={() =>
                          status.mutate({
                            id: provider.id,
                            value: provider.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                          })
                        }
                        size="sm"
                        variant="ghost"
                      >
                        {provider.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                      </Button>
                    </PermissionGate>
                    <PermissionGate permission="providers.delete">
                      <Button onClick={() => archive.mutate(provider.id)} size="sm" variant="ghost">
                        Archivar
                      </Button>
                    </PermissionGate>
                  </div>
                </div>
              ))}
              {providers.data?.data.length === 0 ? (
                <EmptyState
                  title="No hay providers"
                  description="Configura un provider para habilitar asignaciones operativas."
                  action={
                    <PermissionGate permission="providers.create">
                      <Button
                        onClick={() => {
                          setSelected(null);
                          setDrawer('provider');
                        }}
                      >
                        Crear provider
                      </Button>
                    </PermissionGate>
                  }
                />
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Pagination
          onPageChange={setPage}
          page={page}
          totalPages={providers.data?.pagination.totalPages ?? 1}
        />
      </PageGrid>
      <Drawer
        onClose={close}
        open={drawer === 'provider'}
        title={selected ? 'Editar provider' : 'Nuevo provider'}
      >
        <ProviderForm
          onCancel={close}
          onSubmit={(body) => save.mutate(selected?.id ? { id: selected.id, body } : { body })}
          provider={selected}
          submitting={save.isPending}
        />
      </Drawer>
      <Drawer onClose={close} open={drawer === 'mapping'} title="Mapear catálogo">
        {selected ? (
          <>
            <MappingForm
              onCancel={close}
              onSubmit={(body) => mapping.mutate(body)}
              products={products.data?.data ?? []}
              provider={selected}
              submitting={mapping.isPending}
            />
            <div className="mt-6 space-y-2">
              {(mappings.data?.data ?? []).map((item) => (
                <div
                  className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"
                  key={item.id}
                >
                  Producto {item.productId} · prioridad {item.priority} ·{' '}
                  {item.active ? 'activo' : 'inactivo'}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Drawer>
    </QueryState>
  );
}
