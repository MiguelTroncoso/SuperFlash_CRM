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
import { PermissionGate } from '@/components/ui/permission-gate';
import { SearchBar } from '@/components/ui/search-bar';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type {
  Category,
  PriceBook,
  PriceEntry,
  Product,
  ProductPlan,
  JsonRecord,
} from '@/lib/types';

type CatalogTab = 'products' | 'categories' | 'pricing';

const PRODUCT_TYPES = ['DIGITAL', 'SERVICE', 'PHYSICAL', 'SUBSCRIPTION', 'OTHER'];
const FULFILLMENT_MODES = ['MANUAL', 'AUTOMATIC', 'HYBRID', 'DIGITAL_DELIVERY'];
const BILLING_UNITS = [
  'TRIAL',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUAL',
  'ANNUAL',
  'CUSTOM',
];

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
      {label}
      {children}
    </label>
  );
}

function ProductForm({
  product,
  categories,
  onSubmit,
  onCancel,
  submitting,
}: {
  readonly product: Product | null;
  readonly categories: Category[];
  readonly onSubmit: (body: JsonRecord) => void;
  readonly onCancel: () => void;
  readonly submitting: boolean;
}): React.ReactElement {
  const form = useForm({
    defaultValues: {
      name: '',
      slug: '',
      sku: '',
      description: '',
      currency: 'USD',
      categoryId: '',
      type: 'DIGITAL',
      fulfillmentMode: 'MANUAL',
      publicVisible: false,
      stockTrackingEnabled: false,
      stockMinimum: 0,
    },
  });
  useEffect(() => {
    form.reset({
      name: product?.name ?? '',
      slug: product?.slug ?? '',
      sku: product?.sku ?? '',
      description: product?.description ?? '',
      currency: product?.currency ?? 'USD',
      categoryId: product?.category?.id ?? '',
      type: product?.type ?? 'DIGITAL',
      fulfillmentMode: product?.fulfillmentMode ?? 'MANUAL',
      publicVisible: product?.publicVisible ?? false,
      stockTrackingEnabled: product?.stock.trackingEnabled ?? false,
      stockMinimum: product?.stock.minimum ?? 0,
    });
  }, [form, product]);
  const submit = (values: typeof form extends never ? never : Record<string, unknown>): void => {
    const name = String(values.name ?? '');
    const slug = String(values.slug ?? '').trim();
    const sku = String(values.sku ?? '').trim();
    const categoryId = String(values.categoryId ?? '').trim();
    onSubmit({
      ...values,
      name,
      ...(slug ? { slug } : {}),
      ...(sku ? { sku } : {}),
      ...(categoryId ? { categoryId } : {}),
      displayOrder: product?.displayOrder ?? 0,
      stockMinimum: Number(values.stockMinimum ?? 0),
    });
  };
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => submit(values))}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <Input {...form.register('name', { required: true, minLength: 2 })} />
        </Field>
        <Field label="SKU">
          <Input {...form.register('sku')} placeholder="Opcional" />
        </Field>
        <Field label="Slug">
          <Input {...form.register('slug')} placeholder="Se genera si queda vacío" />
        </Field>
        <Field label="Moneda">
          <Input maxLength={3} {...form.register('currency', { required: true })} />
        </Field>
        <Field label="Tipo">
          <Select {...form.register('type')}>
            {PRODUCT_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </Select>
        </Field>
        <Field label="Modo de fulfillment">
          <Select {...form.register('fulfillmentMode')}>
            {FULFILLMENT_MODES.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </Select>
        </Field>
        <Field label="Categoría">
          <Select {...form.register('categoryId')}>
            <option value="">Sin categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stock mínimo">
          <Input min={0} type="number" {...form.register('stockMinimum')} />
        </Field>
      </div>
      <Field label="Descripción">
        <Textarea {...form.register('description')} />
      </Field>
      <div className="flex flex-wrap gap-4 text-sm font-semibold text-slate-600 dark:text-slate-300">
        <label className="flex items-center gap-2">
          <input type="checkbox" {...form.register('publicVisible')} /> Visible públicamente
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...form.register('stockTrackingEnabled')} /> Controlar stock
        </label>
      </div>
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
        <Input {...form.register('name', { required: true, minLength: 2 })} />
      </Field>
      <Field label="Slug">
        <Input {...form.register('slug')} />
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

function PlanForm({
  product,
  plan,
  onSubmit,
  onCancel,
  submitting,
}: {
  readonly product: Product;
  readonly plan: ProductPlan | null;
  readonly onSubmit: (body: JsonRecord) => void;
  readonly onCancel: () => void;
  readonly submitting: boolean;
}): React.ReactElement {
  const form = useForm({
    defaultValues: {
      name: '',
      code: '',
      customerSegment: 'END_CUSTOMER',
      billingPeriodUnit: 'MONTHLY',
      billingPeriodCount: 1,
    },
  });
  useEffect(() => {
    form.reset({
      name: plan?.name ?? '',
      code: plan?.code ?? '',
      customerSegment: plan?.customerSegment ?? 'END_CUSTOMER',
      billingPeriodUnit: plan?.billingPeriodUnit ?? 'MONTHLY',
      billingPeriodCount: plan?.billingPeriodCount ?? 1,
    });
  }, [form, plan]);
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(({ code, ...values }) =>
        onSubmit({
          ...values,
          ...(code.trim() ? { code: code.trim() } : {}),
          billingPeriodCount: Number(values.billingPeriodCount),
        }),
      )}
    >
      <p className="text-xs text-slate-500">Producto: {product.name}</p>
      <Field label="Nombre">
        <Input {...form.register('name', { required: true, minLength: 2 })} />
      </Field>
      <Field label="Código">
        <Input {...form.register('code')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Segmento">
          <Select {...form.register('customerSegment')}>
            <option>END_CUSTOMER</option>
            <option>RESELLER</option>
          </Select>
        </Field>
        <Field label="Ciclo">
          <Select {...form.register('billingPeriodUnit')}>
            {BILLING_UNITS.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Cantidad de ciclos">
        <Input min={1} type="number" {...form.register('billingPeriodCount')} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={submitting} type="submit">
          Guardar plan
        </Button>
      </div>
    </form>
  );
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
  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      status: 'ACTIVE',
      customerSegment: 'END_CUSTOMER',
      currency: 'USD',
      priority: 0,
      isDefault: false,
    },
  });
  useEffect(() => {
    form.reset({
      name: priceBook?.name ?? '',
      description: priceBook?.description ?? '',
      status: priceBook?.status ?? 'ACTIVE',
      customerSegment: priceBook?.customerSegment ?? 'END_CUSTOMER',
      currency: priceBook?.currency ?? 'USD',
      priority: priceBook?.priority ?? 0,
      isDefault: priceBook?.isDefault ?? false,
    });
  }, [form, priceBook]);
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({ ...values, priority: Number(values.priority) }),
      )}
    >
      <Field label="Nombre">
        <Input {...form.register('name', { required: true, minLength: 2 })} />
      </Field>
      <Field label="Descripción">
        <Textarea {...form.register('description')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Moneda">
          <Input maxLength={3} {...form.register('currency', { required: true })} />
        </Field>
        <Field label="Prioridad">
          <Input type="number" {...form.register('priority')} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" {...form.register('isDefault')} /> Price book por defecto
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={submitting} type="submit">
          Guardar price book
        </Button>
      </div>
    </form>
  );
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
  const form = useForm({
    defaultValues: {
      productId: '',
      salePrice: '',
      minimumPrice: '',
      taxIncluded: true,
      active: true,
    },
  });
  useEffect(() => {
    form.reset({
      productId: entry?.productId ?? products[0]?.id ?? '',
      salePrice: entry?.salePrice ?? '',
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
          ...values,
          salePrice: values.salePrice,
          minimumPrice: values.minimumPrice || undefined,
        }),
      )}
    >
      <p className="text-xs text-slate-500">
        Price book: {book.name} · {book.currency}
      </p>
      <Field label="Producto">
        <Select disabled={Boolean(entry)} {...form.register('productId')}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Precio de venta">
          <Input inputMode="decimal" {...form.register('salePrice', { required: true })} />
        </Field>
        <Field label="Precio mínimo">
          <Input inputMode="decimal" {...form.register('minimumPrice')} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" {...form.register('taxIncluded')} /> Impuesto incluido
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={submitting} type="submit">
          Guardar precio
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
  const [entry, setEntry] = useState<PriceEntry | null>(null);
  const [drawer, setDrawer] = useState<
    'product' | 'category' | 'plan' | 'pricebook' | 'entry' | 'stock' | null
  >(null);
  const [plan, setPlan] = useState<ProductPlan | null>(null);
  const [stockDelta, setStockDelta] = useState('');
  const [stockReason, setStockReason] = useState('');
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const products = useQuery({
    queryKey: ['catalog-products', search],
    queryFn: () => api.getProducts(queryString({ page: 1, limit: 100, search })),
  });
  const categories = useQuery({ queryKey: ['catalog-categories'], queryFn: api.getCategories });
  const books = useQuery({
    queryKey: ['catalog-price-books'],
    queryFn: api.getPriceBooks,
    enabled: tab === 'pricing',
  });
  const plans = useQuery({
    queryKey: ['catalog-plans', product?.id],
    queryFn: () => api.getPlans(product?.id ?? ''),
    enabled: Boolean(product?.id && drawer === 'plan'),
  });
  const entries = useQuery({
    queryKey: ['catalog-price-entries', priceBook?.id],
    queryFn: () => api.getPriceEntries(priceBook?.id ?? ''),
    enabled: Boolean(priceBook?.id && tab === 'pricing'),
  });
  const stock = useQuery({
    queryKey: ['catalog-stock', product?.id],
    queryFn: () => api.getProductStock(product?.id ?? ''),
    enabled: Boolean(product?.id && drawer === 'stock'),
  });
  const save = useMutation({
    mutationFn: (input: { id?: string; body: JsonRecord }) =>
      input.id ? api.updateProduct(input.id, input.body) : api.createProduct(input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      setDrawer(null);
      toast({ title: 'Producto guardado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible guardar', description: error.message, tone: 'error' }),
  });
  const status = useMutation({
    mutationFn: (input: { id: string; action: 'activate' | 'deactivate' | 'archive' }) =>
      input.action === 'activate'
        ? api.activateProduct(input.id)
        : input.action === 'deactivate'
          ? api.deactivateProduct(input.id)
          : api.archiveProduct(input.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      toast({ title: 'Estado actualizado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible actualizar', description: error.message, tone: 'error' }),
  });
  const duplicate = useMutation({
    mutationFn: (item: Product) =>
      api.createProduct({
        name: `${item.name} (copia)`,
        slug: `${item.slug}-copy`,
        description: item.description ?? undefined,
        currency: item.currency,
        categoryId: item.category?.id,
        type: item.type,
        fulfillmentMode: item.fulfillmentMode,
        status: 'DRAFT',
        active: false,
        requiresSubscription: item.requiresSubscription,
        allowsDemo: item.allowsDemo,
        publicVisible: false,
        stockTrackingEnabled: item.stock.trackingEnabled,
        stockMinimum: item.stock.minimum,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      toast({ title: 'Producto duplicado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible duplicar', description: error.message, tone: 'error' }),
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
      toast({ title: 'No fue posible guardar', description: error.message, tone: 'error' }),
  });
  const categoryStatus = useMutation({
    mutationFn: (input: { id: string; action: 'archive' | 'restore' }) =>
      input.action === 'archive' ? api.archiveCategory(input.id) : api.restoreCategory(input.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
      toast({ title: 'Categoría actualizada', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible actualizar', description: error.message, tone: 'error' }),
  });
  const savePlan = useMutation({
    mutationFn: (input: { body: JsonRecord; id?: string }) =>
      product && input.id
        ? api.updatePlan(product.id, input.id, input.body)
        : product
          ? api.createPlan(product.id, input.body)
          : Promise.reject(new Error('Producto no seleccionado')),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-plans', product?.id] });
      setDrawer(null);
      toast({ title: 'Plan guardado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible guardar', description: error.message, tone: 'error' }),
  });
  const archivePlan = useMutation({
    mutationFn: (id: string) =>
      product
        ? api.archivePlan(product.id, id)
        : Promise.reject(new Error('Producto no seleccionado')),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-plans', product?.id] });
      toast({ title: 'Plan archivado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible archivar', description: error.message, tone: 'error' }),
  });
  const saveBook = useMutation({
    mutationFn: (input: { id?: string; body: JsonRecord }) =>
      input.id ? api.updatePriceBook(input.id, input.body) : api.createPriceBook(input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-price-books'] });
      setDrawer(null);
      toast({ title: 'Price book guardado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible guardar', description: error.message, tone: 'error' }),
  });
  const bookStatus = useMutation({
    mutationFn: (input: { id: string; action: 'activate' | 'deactivate' | 'archive' }) =>
      input.action === 'activate'
        ? api.activatePriceBook(input.id)
        : input.action === 'deactivate'
          ? api.deactivatePriceBook(input.id)
          : api.archivePriceBook(input.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-price-books'] });
      toast({ title: 'Price book actualizado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible actualizar', description: error.message, tone: 'error' }),
  });
  const saveEntry = useMutation({
    mutationFn: (input: { id?: string; body: JsonRecord }) =>
      priceBook && input.id
        ? api.updatePriceEntry(priceBook.id, input.id, input.body)
        : priceBook
          ? api.createPriceEntry(priceBook.id, input.body)
          : Promise.reject(new Error('Price book no seleccionado')),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-price-entries', priceBook?.id] });
      setDrawer(null);
      toast({ title: 'Precio guardado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible guardar', description: error.message, tone: 'error' }),
  });
  const adjustStock = useMutation({
    mutationFn: () =>
      product
        ? api.adjustProductStock(product.id, { delta: Number(stockDelta), reason: stockReason })
        : Promise.reject(new Error('Producto no seleccionado')),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-stock', product?.id] });
      setStockDelta('');
      setStockReason('');
      toast({ title: 'Stock ajustado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible ajustar stock', description: error.message, tone: 'error' }),
  });
  const close = (): void => {
    setDrawer(null);
    setPlan(null);
    setEntry(null);
  };
  return (
    <QueryState
      isError={products.isError || categories.isError}
      isLoading={products.isLoading || categories.isLoading}
      onRetry={() => void products.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Catálogo y pricing"
          title="Catálogo"
          description="Administra productos comercializables, planes, precios y existencias."
          actions={
            <PermissionGate permission="catalog.create">
              <Button
                onClick={() => {
                  setProduct(null);
                  setDrawer('product');
                }}
              >
                Nuevo producto
              </Button>
            </PermissionGate>
          }
        />
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800">
          {(
            [
              ['products', 'Productos'],
              ['categories', 'Categorías'],
              ['pricing', 'Precios'],
            ] as const
          ).map(([value, label]) => (
            <button
              className={`border-b-2 px-3 py-2 text-sm font-bold ${tab === value ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'}`}
              key={value}
              onClick={() => setTab(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'products' ? (
          <>
            <SearchBar
              className="max-w-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto, slug o SKU"
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
                          {item.sku ?? item.slug} · {item.currency}
                        </CardDescription>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-2 text-sm text-slate-500">
                      {item.description ?? 'Sin descripción.'}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                        <p className="text-slate-400">Planes</p>
                        <p className="mt-1 font-bold">{item.plans.length}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                        <p className="text-slate-400">Stock disponible</p>
                        <p className="mt-1 font-bold">{item.stock.available}</p>
                      </div>
                    </div>
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
                        <Button
                          onClick={() => {
                            setProduct(item);
                            setDrawer('plan');
                          }}
                          size="sm"
                          variant="outline"
                        >
                          Planes
                        </Button>
                        <Button
                          onClick={() => {
                            setProduct(item);
                            setDrawer('stock');
                          }}
                          size="sm"
                          variant="outline"
                        >
                          Stock
                        </Button>
                        <Button onClick={() => duplicate.mutate(item)} size="sm" variant="ghost">
                          Duplicar
                        </Button>
                        {item.status === 'ACTIVE' ? (
                          <Button
                            onClick={() => status.mutate({ id: item.id, action: 'deactivate' })}
                            size="sm"
                            variant="ghost"
                          >
                            Desactivar
                          </Button>
                        ) : (
                          <Button
                            onClick={() => status.mutate({ id: item.id, action: 'activate' })}
                            size="sm"
                            variant="ghost"
                          >
                            Activar
                          </Button>
                        )}
                      </PermissionGate>
                      <PermissionGate permission="catalog.delete">
                        <Button
                          onClick={() => status.mutate({ id: item.id, action: 'archive' })}
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
                    description="Crea el primer producto para comenzar a configurar tu oferta."
                    action={
                      <PermissionGate permission="catalog.create">
                        <Button
                          onClick={() => {
                            setProduct(null);
                            setDrawer('product');
                          }}
                        >
                          Crear producto
                        </Button>
                      </PermissionGate>
                    }
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        {tab === 'categories' ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Categorías</CardTitle>
                  <CardDescription>Organiza la navegación del catálogo.</CardDescription>
                </div>
                <PermissionGate permission="catalog.create">
                  <Button
                    onClick={() => {
                      setCategory(null);
                      setDrawer('category');
                    }}
                  >
                    Nueva categoría
                  </Button>
                </PermissionGate>
              </div>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(categories.data ?? []).map((item) => (
                  <div className="flex items-center justify-between gap-4 py-3" key={item.id}>
                    <div>
                      <p className="font-bold">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.slug}</p>
                    </div>
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
                        onClick={() => categoryStatus.mutate({ id: item.id, action: 'archive' })}
                        size="sm"
                        variant="ghost"
                      >
                        Archivar
                      </Button>
                    </PermissionGate>
                  </div>
                ))}
                {categories.data?.length === 0 ? (
                  <EmptyState
                    title="Sin categorías"
                    description="Crea una categoría para ordenar tus productos."
                  />
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}
        {tab === 'pricing' ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Price books</CardTitle>
                  <CardDescription>
                    Precios vigentes y mínimos protegidos por el backend.
                  </CardDescription>
                </div>
                <PermissionGate permission="catalog.prices.manage">
                  <Button
                    onClick={() => {
                      setPriceBook(null);
                      setDrawer('pricebook');
                    }}
                  >
                    Nuevo price book
                  </Button>
                </PermissionGate>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(books.data ?? []).map((book) => (
                  <div
                    className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                    key={book.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-bold">{book.name}</p>
                        <p className="text-xs text-slate-400">
                          {book.currency} · {book.customerSegment} · prioridad {book.priority}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <StatusBadge status={book.status} />
                        <PermissionGate permission="catalog.prices.manage">
                          <Button
                            onClick={() => {
                              setPriceBook(book);
                              setDrawer('entry');
                            }}
                            size="sm"
                            variant="outline"
                          >
                            Añadir precio
                          </Button>
                          <Button
                            onClick={() => {
                              setPriceBook(book);
                              setDrawer('pricebook');
                            }}
                            size="sm"
                            variant="ghost"
                          >
                            Editar
                          </Button>
                          <Button
                            onClick={() =>
                              bookStatus.mutate({
                                id: book.id,
                                action: book.status === 'ACTIVE' ? 'deactivate' : 'activate',
                              })
                            }
                            size="sm"
                            variant="ghost"
                          >
                            {book.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                          </Button>
                          <Button
                            onClick={() => bookStatus.mutate({ id: book.id, action: 'archive' })}
                            size="sm"
                            variant="ghost"
                          >
                            Archivar
                          </Button>
                        </PermissionGate>
                      </div>
                    </div>
                    {priceBook?.id === book.id ? (
                      <div className="mt-3 space-y-2 text-xs text-slate-500">
                        <p>{entries.data?.length ?? 0} precios cargados.</p>
                        {(entries.data ?? []).map((price) => (
                          <div
                            className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-950"
                            key={price.id}
                          >
                            <span>
                              Producto {price.productId.slice(0, 8)} · {price.salePrice}{' '}
                              {book.currency}
                            </span>
                            <Button
                              onClick={() => {
                                setEntry(price);
                                setPriceBook(book);
                                setDrawer('entry');
                              }}
                              size="sm"
                              variant="ghost"
                            >
                              Editar
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {books.data?.length === 0 ? (
                  <EmptyState
                    title="Sin price books"
                    description="Crea un price book para publicar precios comercializables."
                    action={
                      <PermissionGate permission="catalog.prices.manage">
                        <Button
                          onClick={() => {
                            setPriceBook(null);
                            setDrawer('pricebook');
                          }}
                        >
                          Crear price book
                        </Button>
                      </PermissionGate>
                    }
                  />
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </PageGrid>
      <Drawer
        description="Datos maestros del producto."
        onClose={close}
        open={drawer === 'product'}
        title={product ? 'Editar producto' : 'Nuevo producto'}
      >
        <ProductForm
          categories={categories.data ?? []}
          onCancel={close}
          onSubmit={(body) => save.mutate(product?.id ? { id: product.id, body } : { body })}
          product={product}
          submitting={save.isPending}
        />
      </Drawer>
      <Drawer
        onClose={close}
        open={drawer === 'category'}
        title={category ? 'Editar categoría' : 'Nueva categoría'}
      >
        <CategoryForm
          category={category}
          onCancel={close}
          onSubmit={(body) =>
            saveCategory.mutate(category?.id ? { id: category.id, body } : { body })
          }
          submitting={saveCategory.isPending}
        />
      </Drawer>
      <Drawer onClose={close} open={drawer === 'plan'} title="Planes del producto">
        <div className="space-y-4">
          {product ? (
            <>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setPlan(null);
                  }}
                  size="sm"
                >
                  Nuevo plan
                </Button>
              </div>
              {(plans.data ?? []).map((item) => (
                <div
                  className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800"
                  key={item.id}
                >
                  <div>
                    <p className="font-bold">{item.name}</p>
                    <p className="text-xs text-slate-400">
                      {item.billingPeriodUnit} · {item.billingPeriodCount}
                    </p>
                  </div>
                  <Button onClick={() => setPlan(item)} size="sm" variant="outline">
                    Editar
                  </Button>
                  <Button onClick={() => archivePlan.mutate(item.id)} size="sm" variant="ghost">
                    Archivar
                  </Button>
                </div>
              ))}
              <PlanForm
                onCancel={close}
                onSubmit={(body) => savePlan.mutate(plan?.id ? { id: plan.id, body } : { body })}
                plan={plan}
                product={product}
                submitting={savePlan.isPending}
              />
            </>
          ) : null}
        </div>
      </Drawer>
      <Drawer
        onClose={close}
        open={drawer === 'pricebook'}
        title={priceBook ? 'Editar price book' : 'Nuevo price book'}
      >
        <PriceBookForm
          onCancel={close}
          onSubmit={(body) =>
            saveBook.mutate(priceBook?.id ? { id: priceBook.id, body } : { body })
          }
          priceBook={priceBook}
          submitting={saveBook.isPending}
        />
      </Drawer>
      <Drawer onClose={close} open={drawer === 'entry'} title="Nuevo precio">
        <PriceEntryForm
          book={
            priceBook ?? {
              id: '',
              name: '',
              description: null,
              status: 'ACTIVE',
              customerSegment: 'END_CUSTOMER',
              countryCode: null,
              currency: 'USD',
              validFrom: null,
              validUntil: null,
              isDefault: false,
              priority: 0,
              archivedAt: null,
            }
          }
          entry={entry}
          onCancel={close}
          onSubmit={(body) => saveEntry.mutate(entry?.id ? { id: entry.id, body } : { body })}
          products={products.data?.data ?? []}
          submitting={saveEntry.isPending}
        />
      </Drawer>
      <Drawer onClose={close} open={drawer === 'stock'} title="Existencias">
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-slate-400">Actual</p>
              <p className="mt-1 text-lg font-bold">{stock.data?.quantity ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-slate-400">Reservado</p>
              <p className="mt-1 text-lg font-bold">{stock.data?.reserved ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-slate-400">Disponible</p>
              <p className="mt-1 text-lg font-bold">{stock.data?.available ?? 0}</p>
            </div>
          </div>
          <Field label="Ajuste (+/-)">
            <Input
              onChange={(event) => setStockDelta(event.target.value)}
              type="number"
              value={stockDelta}
            />
          </Field>
          <Field label="Motivo">
            <Textarea
              onChange={(event) => setStockReason(event.target.value)}
              value={stockReason}
            />
          </Field>
          <Button
            disabled={!stockReason.trim() || !stockDelta || adjustStock.isPending}
            onClick={() => adjustStock.mutate()}
          >
            Aplicar ajuste
          </Button>
        </div>
      </Drawer>
    </QueryState>
  );
}
