'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { CreatableCombobox } from '@/components/shared/creatable-combobox';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PermissionGate } from '@/components/ui/permission-gate';
import { SearchBar } from '@/components/ui/search-bar';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { ApiClientError, api, queryString } from '@/lib/api-client';
import type { Category, JsonRecord, Product } from '@/lib/types';

type CatalogTab = 'products' | 'categories';

const PRODUCT_TYPES = [
  ['SUBSCRIPTION', 'Suscripción'],
  ['CREDIT_PACKAGE', 'Paquete de créditos'],
  ['LICENSE', 'Licencia'],
  ['SERVICE', 'Servicio'],
  ['DIGITAL_ACCESS', 'Acceso digital'],
  ['OTHER', 'Otro'],
] as const;
const FULFILLMENT_MODES = [
  ['MANUAL', 'Manual'],
  ['API', 'API'],
  ['INVITATION', 'Invitación'],
  ['CREDENTIALS', 'Credenciales'],
  ['DOWNLOAD', 'Descarga'],
  ['OTHER', 'Otro'],
] as const;

function catalogErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const messages: Record<string, string> = {
      PRODUCT_SLUG_ALREADY_EXISTS: 'Ya existe un producto con ese slug.',
      PRODUCT_SKU_ALREADY_EXISTS: 'Ya existe un producto con ese SKU.',
      CATEGORY_NAME_ALREADY_EXISTS: 'Ya existe una categoría con ese nombre.',
      PRODUCT_INVALID_TYPE: 'El tipo de producto no es válido.',
      PRODUCT_INVALID_FULFILLMENT_MODE: 'El modo de entrega no es válido.',
    };
    return messages[error.code ?? ''] ?? 'Revisa los datos del catálogo e inténtalo nuevamente.';
  }
  return 'No fue posible completar la operación del catálogo.';
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

interface ProductFormValues {
  name: string;
  sku: string;
  description: string;
  currency: string;
  categoryId: string;
  type: string;
  fulfillmentMode: string;
}

function ProductForm({
  product,
  categories,
  onSubmit,
  onCancel,
  onCreateCategory,
  submitting,
  categoryCreatePending,
}: {
  readonly product: Product | null;
  readonly categories: Category[];
  readonly onSubmit: (body: JsonRecord) => void;
  readonly onCancel: () => void;
  readonly onCreateCategory: (name: string) => Promise<Category>;
  readonly submitting: boolean;
  readonly categoryCreatePending: boolean;
}): React.ReactElement {
  const form = useForm<ProductFormValues>({
    defaultValues: {
      name: '',
      sku: '',
      description: '',
      currency: 'USD',
      categoryId: '',
      type: 'OTHER',
      fulfillmentMode: 'MANUAL',
    },
  });
  const [categorySearch, setCategorySearch] = useState('');
  useEffect(() => {
    form.reset({
      name: product?.name ?? '',
      sku: product?.sku ?? '',
      description: product?.description ?? '',
      currency: product?.currency ?? 'USD',
      categoryId: product?.category?.id ?? '',
      type: product?.type ?? 'OTHER',
      fulfillmentMode: product?.fulfillmentMode ?? 'MANUAL',
    });
    setCategorySearch(product?.category?.name ?? '');
  }, [form, product]);
  const categoryOptions = categories
    .filter((category) => category.active && !category.archivedAt)
    .map((category) => ({ id: category.id, label: category.name }));
  const selectedCategory = categories.find((category) => category.id === form.watch('categoryId'));
  const createCategory = (name: string): void => {
    void onCreateCategory(name)
      .then((category) => {
        form.setValue('categoryId', category.id, { shouldDirty: true, shouldValidate: true });
        setCategorySearch(category.name);
      })
      .catch(() => undefined);
  };
  const submit = (values: ProductFormValues): void => {
    const sku = values.sku.trim();
    const categoryId = values.categoryId.trim();
    onSubmit({
      name: values.name.trim(),
      ...(sku ? { sku } : {}),
      ...(values.description.trim() ? { description: values.description.trim() } : {}),
      currency: values.currency.trim().toUpperCase(),
      categoryId: categoryId || null,
      type: values.type,
      fulfillmentMode: values.fulfillmentMode,
    });
  };
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
      <Field label="Nombre">
        <Input autoFocus {...form.register('name', { required: true, minLength: 2 })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SKU">
          <Input {...form.register('sku')} placeholder="Opcional" />
        </Field>
        <Field label="Moneda">
          <Input maxLength={3} {...form.register('currency', { required: true })} />
        </Field>
        <CreatableCombobox
          createLabel="Crear categoría"
          emptyLabel="Sin categoría"
          isLoading={categoryCreatePending}
          label="Categoría"
          onCreate={createCategory}
          onSearch={setCategorySearch}
          onSelect={(option) =>
            form.setValue('categoryId', option?.id ?? '', { shouldDirty: true })
          }
          options={categoryOptions}
          placeholder="Buscar o crear categoría..."
          search={categorySearch}
          selectedLabel={selectedCategory?.name}
        />
        <Field label="Tipo">
          <Select {...form.register('type')}>
            {PRODUCT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Modo de entrega">
          <Select {...form.register('fulfillmentMode')}>
            {FULFILLMENT_MODES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Descripción">
        <Textarea {...form.register('description')} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={submitting} type="submit">
          {submitting ? 'Guardando…' : product ? 'Guardar producto' : 'Crear producto'}
        </Button>
      </div>
    </form>
  );
}

function CategoryForm({
  category,
  onSubmit,
  onCancel,
  submitting,
}: {
  readonly category: Category | null;
  readonly onSubmit: (body: JsonRecord) => void;
  readonly onCancel: () => void;
  readonly submitting: boolean;
}): React.ReactElement {
  const form = useForm({ defaultValues: { name: '', slug: '', description: '' } });
  useEffect(() => {
    form.reset({
      name: category?.name ?? '',
      slug: category?.slug ?? '',
      description: category?.description ?? '',
    });
  }, [category, form]);
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(({ slug, ...values }) =>
        onSubmit({ ...values, ...(slug.trim() ? { slug: slug.trim() } : {}) }),
      )}
    >
      <Field label="Nombre">
        <Input autoFocus {...form.register('name', { required: true, minLength: 2 })} />
      </Field>
      <Field label="Slug">
        <Input {...form.register('slug')} placeholder="Se genera si queda vacío" />
      </Field>
      <Field label="Descripción">
        <Textarea {...form.register('description')} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={submitting} type="submit">
          Guardar categoría
        </Button>
      </div>
    </form>
  );
}

export function CatalogPage(): React.ReactElement {
  const [tab, setTab] = useState<CatalogTab>('products');
  const [search, setSearch] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [drawer, setDrawer] = useState<'product' | 'category' | null>(null);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const products = useQuery({
    queryKey: ['catalog-products', search],
    queryFn: () => api.getProducts(queryString({ page: 1, limit: 100, search })),
  });
  const categories = useQuery({ queryKey: ['catalog-categories'], queryFn: api.getCategories });
  const createCategoryQuick = useMutation({
    mutationFn: (name: string) => api.createCategoryQuick({ name }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
      toast({ title: 'Categoría lista', description: created.name, tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible crear la categoría',
        description: catalogErrorMessage(error),
        tone: 'error',
      }),
  });
  const saveProduct = useMutation({
    mutationFn: (input: { id?: string; body: JsonRecord }) =>
      input.id
        ? api.updateProduct(input.id, input.body)
        : api.createProduct({ ...input.body, status: 'ACTIVE', active: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      setDrawer(null);
      toast({ title: 'Producto guardado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible guardar',
        description: catalogErrorMessage(error),
        tone: 'error',
      }),
  });
  const productStatus = useMutation({
    mutationFn: (input: { id: string; action: 'activate' | 'deactivate' | 'archive' }) =>
      input.action === 'activate'
        ? api.activateProduct(input.id)
        : input.action === 'deactivate'
          ? api.deactivateProduct(input.id)
          : api.archiveProduct(input.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      toast({ title: 'Producto actualizado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible actualizar',
        description: catalogErrorMessage(error),
        tone: 'error',
      }),
  });
  const saveCategory = useMutation({
    mutationFn: (input: { id?: string; body: JsonRecord }) =>
      input.id ? api.updateCategory(input.id, input.body) : api.createCategory(input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
      setDrawer(null);
      toast({ title: 'Categoría guardada', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible guardar',
        description: catalogErrorMessage(error),
        tone: 'error',
      }),
  });
  const categoryStatus = useMutation({
    mutationFn: (input: { id: string; action: 'archive' | 'restore' }) =>
      input.action === 'archive' ? api.archiveCategory(input.id) : api.restoreCategory(input.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
      toast({ title: 'Categoría actualizada', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible actualizar',
        description: catalogErrorMessage(error),
        tone: 'error',
      }),
  });
  const close = (): void => {
    setDrawer(null);
    setProduct(null);
    setCategory(null);
  };
  return (
    <QueryState
      isError={products.isError || categories.isError}
      isLoading={products.isLoading || categories.isLoading}
      onRetry={() => void Promise.all([products.refetch(), categories.refetch()])}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Operación comercial"
          title="Catálogo"
          description="Mantén las categorías y productos que el equipo usa para vender."
          actions={
            <PermissionGate permission="catalog.create">
              <Button
                onClick={() => {
                  setProduct(null);
                  setDrawer('product');
                }}
              >
                ＋ Nuevo producto
              </Button>
            </PermissionGate>
          }
        />
        <div className="flex gap-2 border-b border-border-subtle">
          {(['products', 'categories'] as const).map((value) => (
            <button
              className={`border-b-2 px-3 py-2 text-sm font-bold ${tab === value ? 'border-brand-600 text-brand-600' : 'border-transparent text-content-muted'}`}
              key={value}
              onClick={() => setTab(value)}
              type="button"
            >
              {value === 'products' ? 'Productos' : 'Categorías'}
            </button>
          ))}
        </div>
        {tab === 'products' ? (
          <>
            <SearchBar
              className="max-w-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto o SKU"
              value={search}
            />
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {(products.data?.data ?? []).map((item) => (
                <Card key={item.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{item.name}</CardTitle>
                        <CardDescription>
                          {item.category?.name ?? 'Sin categoría'} · {item.currency}
                        </CardDescription>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-content-secondary">
                      {item.description ?? 'Sin descripción.'}
                    </p>
                    <p className="mt-3 text-xs text-content-muted">
                      {item.sku ?? 'Sin SKU'} · {item.type}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <PermissionGate permission="catalog.update">
                        <Button
                          onClick={() => {
                            setProduct(item);
                            setDrawer('product');
                          }}
                          size="sm"
                          variant="outline"
                        >
                          Editar
                        </Button>
                        {item.status === 'ACTIVE' ? (
                          <Button
                            onClick={() =>
                              productStatus.mutate({ id: item.id, action: 'deactivate' })
                            }
                            size="sm"
                            variant="ghost"
                          >
                            Desactivar
                          </Button>
                        ) : (
                          <Button
                            onClick={() =>
                              productStatus.mutate({ id: item.id, action: 'activate' })
                            }
                            size="sm"
                            variant="ghost"
                          >
                            Activar
                          </Button>
                        )}
                      </PermissionGate>
                      <PermissionGate permission="catalog.delete">
                        <Button
                          onClick={() => productStatus.mutate({ id: item.id, action: 'archive' })}
                          size="sm"
                          variant="ghost"
                        >
                          Archivar
                        </Button>
                      </PermissionGate>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {products.data?.data.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3">
                  <EmptyState
                    title="Catálogo vacío"
                    description="Crea el primer producto para comenzar a vender."
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Categorías</CardTitle>
                  <CardDescription>Las familias comerciales de tu catálogo.</CardDescription>
                </div>
                <PermissionGate permission="catalog.create">
                  <Button
                    onClick={() => {
                      setCategory(null);
                      setDrawer('category');
                    }}
                  >
                    ＋ Nueva categoría
                  </Button>
                </PermissionGate>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-border-subtle">
              {(categories.data ?? []).map((item) => (
                <div className="flex items-center justify-between gap-4 py-3" key={item.id}>
                  <div>
                    <p className="font-bold text-content-primary">{item.name}</p>
                    <p className="text-xs text-content-muted">{item.slug}</p>
                  </div>
                  <div className="flex gap-2">
                    <PermissionGate permission="catalog.update">
                      <Button
                        onClick={() => {
                          setCategory(item);
                          setDrawer('category');
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Editar
                      </Button>
                    </PermissionGate>
                    <PermissionGate permission="catalog.delete">
                      <Button
                        onClick={() =>
                          categoryStatus.mutate({
                            id: item.id,
                            action: item.archivedAt ? 'restore' : 'archive',
                          })
                        }
                        size="sm"
                        variant="ghost"
                      >
                        {item.archivedAt ? 'Restaurar' : 'Archivar'}
                      </Button>
                    </PermissionGate>
                  </div>
                </div>
              ))}
              {categories.data?.length === 0 ? (
                <EmptyState
                  title="Sin categorías"
                  description="Crea una familia comercial para ordenar tus productos."
                />
              ) : null}
            </CardContent>
          </Card>
        )}
      </PageGrid>
      <Drawer
        description="Datos esenciales del producto."
        onClose={close}
        open={drawer === 'product'}
        title={product ? 'Editar producto' : 'Nuevo producto'}
      >
        <ProductForm
          categories={categories.data ?? []}
          categoryCreatePending={createCategoryQuick.isPending}
          onCancel={close}
          onCreateCategory={(name) => createCategoryQuick.mutateAsync(name)}
          onSubmit={(body) => saveProduct.mutate(product ? { id: product.id, body } : { body })}
          product={product}
          submitting={saveProduct.isPending}
        />
      </Drawer>
      <Drawer
        description="Crea una familia comercial para organizar productos."
        onClose={close}
        open={drawer === 'category'}
        title={category ? 'Editar categoría' : 'Nueva categoría'}
      >
        <CategoryForm
          category={category}
          onCancel={close}
          onSubmit={(body) => saveCategory.mutate(category ? { id: category.id, body } : { body })}
          submitting={saveCategory.isPending}
        />
      </Drawer>
    </QueryState>
  );
}
