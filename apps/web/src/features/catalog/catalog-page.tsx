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
import { useAuthStore } from '@/lib/auth-store';
import type { Category, JsonRecord, PriceBook, PriceEntry, Product } from '@/lib/types';

type CatalogTab = 'products' | 'categories' | 'pricing';

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
  stockTrackingEnabled: boolean;
  stockQuantity: string;
  stockMinimum: string;
  requiresSubscription: boolean;
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
      stockTrackingEnabled: false,
      stockQuantity: '',
      stockMinimum: '0',
      requiresSubscription: false,
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
      stockTrackingEnabled: product?.stock.trackingEnabled ?? false,
      stockQuantity: product ? String(product.stock.quantity) : '',
      stockMinimum: String(product?.stock.minimum ?? 0),
      requiresSubscription: product?.requiresSubscription ?? false,
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
      stockTrackingEnabled: values.stockTrackingEnabled,
      stockMinimum: Number(values.stockMinimum || 0),
      requiresSubscription: values.requiresSubscription,
      ...(!product && values.stockQuantity.trim()
        ? { stockQuantity: Number(values.stockQuantity) }
        : {}),
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
        <div className="rounded-lg border border-border-subtle p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-content-primary">
            <input type="checkbox" {...form.register('stockTrackingEnabled')} /> Controlar stock
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={product ? 'Stock actual' : 'Stock inicial'}>
              <Input
                disabled={Boolean(product)}
                min={0}
                type="number"
                {...form.register('stockQuantity')}
              />
            </Field>
            <Field label="Stock mínimo">
              <Input min={0} type="number" {...form.register('stockMinimum')} />
            </Field>
          </div>
        </div>
      </div>
      <Field label="Descripción">
        <Textarea {...form.register('description')} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-content-primary">
        <input type="checkbox" {...form.register('requiresSubscription')} /> Requiere renovación
      </label>
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

interface PriceBookFormValues {
  name: string;
  description: string;
  currency: string;
  status: string;
  customerSegment: string;
  priority: string;
  isDefault: boolean;
}

function PriceBookForm({
  priceBook,
  onSubmit,
  onCancel,
  submitting,
}: {
  readonly priceBook: PriceBook | null;
  readonly onSubmit: (body: JsonRecord) => void;
  readonly onCancel: () => void;
  readonly submitting: boolean;
}): React.ReactElement {
  const form = useForm<PriceBookFormValues>({
    defaultValues: {
      name: '',
      description: '',
      currency: 'USD',
      status: 'ACTIVE',
      customerSegment: 'ANY',
      priority: '0',
      isDefault: false,
    },
  });
  useEffect(() => {
    form.reset({
      name: priceBook?.name ?? '',
      description: priceBook?.description ?? '',
      currency: priceBook?.currency ?? 'USD',
      status: priceBook?.status ?? 'ACTIVE',
      customerSegment: priceBook?.customerSegment ?? 'ANY',
      priority: String(priceBook?.priority ?? 0),
      isDefault: priceBook?.isDefault ?? false,
    });
  }, [form, priceBook]);
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          name: values.name.trim(),
          description: values.description.trim() || undefined,
          currency: values.currency.trim().toUpperCase(),
          status: values.status,
          customerSegment: values.customerSegment,
          priority: Number(values.priority),
          isDefault: values.isDefault,
        }),
      )}
    >
      <Field label="Nombre">
        <Input autoFocus {...form.register('name', { required: true, minLength: 2 })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Moneda">
          <Input maxLength={3} {...form.register('currency', { required: true })} />
        </Field>
        <Field label="Segmento">
          <Select {...form.register('customerSegment')}>
            <option value="ANY">Cualquiera</option>
            <option value="END_CUSTOMER">Cliente final</option>
            <option value="RESELLER">Reseller</option>
          </Select>
        </Field>
        <Field label="Estado">
          <Select {...form.register('status')}>
            <option value="ACTIVE">Activo</option>
            <option value="INACTIVE">Inactivo</option>
          </Select>
        </Field>
        <Field label="Prioridad">
          <Input min={0} type="number" {...form.register('priority')} />
        </Field>
      </div>
      <Field label="Descripción">
        <Textarea {...form.register('description')} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-content-primary">
        <input type="checkbox" {...form.register('isDefault')} /> Price book por defecto
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={submitting} type="submit">
          {submitting ? 'Guardando…' : 'Guardar price book'}
        </Button>
      </div>
    </form>
  );
}

interface PriceEntryFormValues {
  productId: string;
  salePrice: string;
  costPrice: string;
  minimumPrice: string;
  taxIncluded: boolean;
  active: boolean;
}

function PriceEntryForm({
  book,
  products,
  entry,
  onSubmit,
  onCancel,
  submitting,
}: {
  readonly book: PriceBook;
  readonly products: Product[];
  readonly entry: PriceEntry | null;
  readonly onSubmit: (body: JsonRecord) => void;
  readonly onCancel: () => void;
  readonly submitting: boolean;
}): React.ReactElement {
  const form = useForm<PriceEntryFormValues>({
    defaultValues: {
      productId: '',
      salePrice: '',
      costPrice: '',
      minimumPrice: '',
      taxIncluded: true,
      active: true,
    },
  });
  useEffect(() => {
    form.reset({
      productId: entry?.productId ?? products[0]?.id ?? '',
      salePrice: entry?.salePrice ?? '',
      costPrice: entry?.costPrice ?? '',
      minimumPrice: entry?.minimumPrice ?? '',
      taxIncluded: entry?.taxIncluded ?? true,
      active: entry?.active ?? true,
    });
  }, [entry, form, products]);
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          productId: values.productId,
          salePrice: values.salePrice,
          ...(values.costPrice.trim() ? { costPrice: values.costPrice } : {}),
          ...(values.minimumPrice.trim() ? { minimumPrice: values.minimumPrice } : {}),
          taxIncluded: values.taxIncluded,
          active: values.active,
        }),
      )}
    >
      <p className="text-xs text-content-muted">
        {book.name} · moneda {book.currency}
      </p>
      <Field label="Producto">
        <Select disabled={Boolean(entry)} {...form.register('productId', { required: true })}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} {product.sku ? `· ${product.sku}` : ''}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Precio de venta">
          <Input
            inputMode="decimal"
            min="0"
            step="0.01"
            {...form.register('salePrice', { required: true })}
          />
        </Field>
        <Field label="Costo">
          <Input inputMode="decimal" min="0" step="0.01" {...form.register('costPrice')} />
        </Field>
        <Field label="Precio mínimo">
          <Input inputMode="decimal" min="0" step="0.01" {...form.register('minimumPrice')} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-content-primary">
        <input type="checkbox" {...form.register('taxIncluded')} /> Impuesto incluido
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-content-primary">
        <input type="checkbox" {...form.register('active')} /> Precio activo
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={submitting || products.length === 0} type="submit">
          {submitting ? 'Guardando…' : 'Guardar precio'}
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
  const [priceBook, setPriceBook] = useState<PriceBook | null>(null);
  const [priceEntry, setPriceEntry] = useState<PriceEntry | null>(null);
  const [drawer, setDrawer] = useState<'product' | 'category' | null>(null);
  const [pricingDrawer, setPricingDrawer] = useState<'priceBook' | 'entry' | null>(null);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  const canReadCosts = permissions.includes('catalog.costs.read');
  const products = useQuery({
    queryKey: ['catalog-products', search],
    queryFn: () => api.getProducts(queryString({ page: 1, limit: 100, search })),
  });
  const categories = useQuery({ queryKey: ['catalog-categories'], queryFn: api.getCategories });
  const priceBooks = useQuery({
    queryKey: ['catalog-price-books'],
    queryFn: api.getPriceBooks,
    enabled: tab === 'pricing',
  });
  const priceEntries = useQuery({
    queryKey: ['catalog-price-entries', priceBook?.id, canReadCosts],
    queryFn: () =>
      api.getPriceEntries(priceBook?.id ?? '', canReadCosts ? '?includeCosts=true' : ''),
    enabled: tab === 'pricing' && Boolean(priceBook?.id),
  });
  useEffect(() => {
    const first = priceBooks.data?.[0];
    if (tab === 'pricing' && !priceBook && first) {
      setPriceBook(first);
    }
  }, [priceBook, priceBooks.data, tab]);
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
  const duplicateProduct = useMutation({
    mutationFn: (item: Product) => {
      const suffix = Date.now().toString(36).toUpperCase();
      return api.createProduct({
        name: `${item.name} (copia)`,
        slug: `${item.slug}-copy-${suffix}`,
        ...(item.sku ? { sku: `${item.sku}-C${suffix}`.slice(0, 64) } : {}),
        description: item.description ?? undefined,
        currency: item.currency,
        categoryId: item.category?.id ?? null,
        type: item.type,
        fulfillmentMode: item.fulfillmentMode,
        status: 'DRAFT',
        active: false,
        requiresSubscription: item.requiresSubscription,
        allowsDemo: item.allowsDemo,
        publicVisible: false,
        stockTrackingEnabled: item.stock.trackingEnabled,
        stockMinimum: item.stock.minimum,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      toast({ title: 'Producto duplicado como borrador', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible duplicar',
        description: catalogErrorMessage(error),
        tone: 'error',
      }),
  });
  const adjustStock = useMutation({
    mutationFn: (input: { id: string; delta: number; reason: string }) =>
      api.adjustProductStock(input.id, {
        delta: input.delta,
        reason: input.reason,
        movementType: 'ADJUSTMENT',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      toast({ title: 'Stock actualizado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible ajustar el stock',
        description: error.message,
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
  const savePriceBook = useMutation({
    mutationFn: (input: { id?: string; body: JsonRecord }) =>
      input.id ? api.updatePriceBook(input.id, input.body) : api.createPriceBook(input.body),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-price-books'] });
      setPriceBook(saved);
      setPricingDrawer(null);
      toast({ title: 'Lista de precios guardada', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible guardar la lista',
        description: catalogErrorMessage(error),
        tone: 'error',
      }),
  });
  const savePriceEntry = useMutation({
    mutationFn: (input: { id?: string; body: JsonRecord }) =>
      priceBook && input.id
        ? api.updatePriceEntry(priceBook.id, input.id, input.body)
        : priceBook
          ? api.createPriceEntry(priceBook.id, input.body)
          : Promise.reject(new Error('Selecciona una lista de precios.')),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-price-entries', priceBook?.id] });
      setPricingDrawer(null);
      setPriceEntry(null);
      toast({ title: 'Precio guardado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible guardar el precio',
        description: catalogErrorMessage(error),
        tone: 'error',
      }),
  });
  const close = (): void => {
    setDrawer(null);
    setProduct(null);
    setCategory(null);
  };
  const closePricing = (): void => {
    setPricingDrawer(null);
    setPriceEntry(null);
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
          {(['products', 'categories', 'pricing'] as const).map((value) => (
            <button
              className={`border-b-2 px-3 py-2 text-sm font-bold ${tab === value ? 'border-brand-600 text-brand-600' : 'border-transparent text-content-muted'}`}
              key={value}
              onClick={() => setTab(value)}
              type="button"
            >
              {value === 'products'
                ? 'Productos'
                : value === 'categories'
                  ? 'Categorías'
                  : 'Precios'}
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
                    <p className="mt-2 text-sm text-content-secondary">
                      Stock: {item.stock.quantity} · Mínimo: {item.stock.minimum}
                      {item.stock.trackingEnabled && item.stock.quantity <= item.stock.minimum
                        ? ' · Bajo'
                        : ''}
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
                        <Button
                          onClick={() => {
                            const rawDelta = window.prompt(
                              'Variación de stock (+ entrada / - salida)',
                              '1',
                            );
                            if (!rawDelta) return;
                            const delta = Number(rawDelta);
                            if (!Number.isInteger(delta) || delta === 0) return;
                            const reason = window.prompt(
                              'Motivo del movimiento',
                              'Ajuste operativo',
                            );
                            if (reason?.trim())
                              adjustStock.mutate({ id: item.id, delta, reason: reason.trim() });
                          }}
                          size="sm"
                          variant="outline"
                        >
                          Ajustar stock
                        </Button>
                      </PermissionGate>
                      <PermissionGate permission="catalog.create">
                        <Button
                          disabled={duplicateProduct.isPending}
                          onClick={() => duplicateProduct.mutate(item)}
                          size="sm"
                          variant="outline"
                        >
                          Duplicar
                        </Button>
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
        ) : tab === 'categories' ? (
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
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Precios, costos y margen</CardTitle>
                  <CardDescription>
                    Define listas vigentes y el precio que se autocompleta al crear una venta.
                  </CardDescription>
                </div>
                <PermissionGate permission="catalog.prices.manage">
                  <Button onClick={() => setPricingDrawer('priceBook')} size="sm" variant="outline">
                    ＋ Nueva lista
                  </Button>
                </PermissionGate>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {priceBooks.data?.length ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {priceBooks.data.map((book) => (
                    <Button
                      key={book.id}
                      onClick={() => setPriceBook(book)}
                      size="sm"
                      variant={priceBook?.id === book.id ? 'primary' : 'outline'}
                    >
                      {book.name} · {book.currency}
                    </Button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No hay listas de precios"
                  description="Crea una lista para asignar precio, costo y precio mínimo a tus productos."
                />
              )}
              {priceBook ? (
                <div className="overflow-x-auto rounded-xl border border-border-subtle">
                  <div className="flex items-center justify-between gap-3 border-b border-border-subtle p-3">
                    <div>
                      <p className="font-bold text-content-primary">{priceBook.name}</p>
                      <p className="text-xs text-content-muted">
                        {priceBook.status} · segmento {priceBook.customerSegment}
                      </p>
                    </div>
                    <PermissionGate permission="catalog.prices.manage">
                      <Button
                        onClick={() => {
                          setPriceEntry(null);
                          setPricingDrawer('entry');
                        }}
                        size="sm"
                      >
                        ＋ Nuevo precio
                      </Button>
                    </PermissionGate>
                  </div>
                  <table className="min-w-[760px] w-full text-left text-sm">
                    <thead className="bg-surface-muted text-xs uppercase text-content-muted">
                      <tr>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3">Precio</th>
                        {canReadCosts ? <th className="px-4 py-3">Costo</th> : null}
                        {canReadCosts ? <th className="px-4 py-3">Margen</th> : null}
                        <th className="px-4 py-3">Mínimo</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {(priceEntries.data ?? []).map((entry) => {
                        const catalogProduct = products.data?.data.find(
                          (item) => item.id === entry.productId,
                        );
                        const sale = Number(entry.salePrice);
                        const cost = entry.costPrice === undefined ? null : Number(entry.costPrice);
                        const margin =
                          cost !== null && sale > 0 ? ((sale - cost) / sale) * 100 : null;
                        return (
                          <tr key={entry.id}>
                            <td className="px-4 py-3 font-semibold text-content-primary">
                              {catalogProduct?.name ?? entry.productId.slice(0, 8)}
                            </td>
                            <td className="px-4 py-3 text-content-primary">
                              {priceBook.currency} {entry.salePrice}
                            </td>
                            {canReadCosts ? (
                              <td className="px-4 py-3 text-content-secondary">
                                {entry.costPrice ?? '—'}
                              </td>
                            ) : null}
                            {canReadCosts ? (
                              <td className="px-4 py-3 text-content-secondary">
                                {margin === null ? '—' : `${margin.toFixed(2)}%`}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-content-secondary">
                              {entry.minimumPrice ?? '—'}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={entry.active ? 'ACTIVE' : 'INACTIVE'} />
                            </td>
                            <td className="px-4 py-3">
                              <PermissionGate permission="catalog.prices.manage">
                                <Button
                                  onClick={() => {
                                    setPriceEntry(entry);
                                    setPricingDrawer('entry');
                                  }}
                                  size="sm"
                                  variant="outline"
                                >
                                  Editar
                                </Button>
                              </PermissionGate>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!priceEntries.data?.length ? (
                    <p className="p-5 text-sm text-content-muted">
                      Esta lista todavía no tiene precios asignados.
                    </p>
                  ) : null}
                </div>
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
      <Drawer
        description="Configura moneda, segmento y prioridad de resolución."
        onClose={closePricing}
        open={pricingDrawer === 'priceBook'}
        title={priceBook ? 'Editar lista de precios' : 'Nueva lista de precios'}
      >
        <PriceBookForm
          onCancel={closePricing}
          onSubmit={(body) =>
            savePriceBook.mutate(priceBook ? { id: priceBook.id, body } : { body })
          }
          priceBook={priceBook}
          submitting={savePriceBook.isPending}
        />
      </Drawer>
      {priceBook ? (
        <Drawer
          description="El costo queda protegido por permiso; el precio se utiliza al vender."
          onClose={closePricing}
          open={pricingDrawer === 'entry'}
          title={priceEntry ? 'Editar precio' : 'Nuevo precio'}
        >
          <PriceEntryForm
            book={priceBook}
            entry={priceEntry}
            onCancel={closePricing}
            onSubmit={(body) =>
              savePriceEntry.mutate(priceEntry ? { id: priceEntry.id, body } : { body })
            }
            products={products.data?.data ?? []}
            submitting={savePriceEntry.isPending}
          />
        </Drawer>
      ) : null}
    </QueryState>
  );
}
