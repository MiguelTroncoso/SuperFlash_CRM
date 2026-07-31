'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select, Textarea } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { FinancialDashboard, FinancialExpense } from '@/lib/types';

const CURRENCIES = ['CLP', 'USD', 'EUR', 'MXN', 'PEN'] as const;
const FREQUENCIES = ['ONE_TIME', 'WEEKLY', 'MONTHLY', 'ANNUAL'] as const;
const PAYMENT_METHODS = ['TRANSFER', 'CARD', 'CASH', 'DIRECT_DEBIT', 'OTHER'] as const;

function money(value: string | undefined, currency: string | null | undefined): string {
  if (value === undefined) return '—';
  return `${currency ?? '—'} ${Number(value).toLocaleString('es-CL', { maximumFractionDigits: 2 })}`;
}

function FinanceTabs(): React.ReactElement {
  const tabs = [
    { href: '/financial', label: 'Dashboard' },
    { href: '/financial/expenses', label: 'Gastos' },
    { href: '/financial/categories', label: 'Categorías' },
  ];
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Finanzas">
      {tabs.map((tab) => (
        <Link href={tab.href} key={tab.href}>
          <Button className="shrink-0" variant="outline" size="sm">
            {tab.label}
          </Button>
        </Link>
      ))}
    </nav>
  );
}

export function FinancialDashboardPage(): React.ReactElement {
  const [month, setMonth] = useState('');
  const [currency, setCurrency] = useState('CLP');
  const query = useMemo(() => queryString({ month, currency }), [month, currency]);
  const dashboard = useQuery({
    queryKey: ['financial-dashboard', query],
    queryFn: () => api.getFinancialDashboard(query),
  });
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Finanzas · Phase 1"
        title="Dashboard financiero"
        description="Ingresos, gastos y utilidad calculados sobre la operación comercial existente."
      />
      <FinanceTabs />
      <Card>
        <CardContent className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
          <label className="text-xs font-semibold text-content-secondary">
            Mes
            <Input
              className="mt-1"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-content-secondary">
            Moneda de análisis
            <Select
              className="mt-1"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {CURRENCIES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </label>
        </CardContent>
      </Card>
      <QueryState
        isLoading={dashboard.isLoading}
        isError={dashboard.isError}
        onRetry={() => void dashboard.refetch()}
      >
        {dashboard.data ? (
          <FinancialDashboardContent dashboard={dashboard.data} />
        ) : (
          <EmptyState
            title="Sin datos financieros"
            description="Registra gastos y ventas para construir el primer período."
          />
        )}
      </QueryState>
    </PageGrid>
  );
}

function FinancialDashboardContent({
  dashboard,
}: {
  readonly dashboard: FinancialDashboard;
}): React.ReactElement {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon="↗"
          label="Ingresos del mes"
          value={money(dashboard.revenue, dashboard.currency)}
        />
        <MetricCard
          icon="−"
          label="Gastos del mes"
          value={money(dashboard.expenses, dashboard.currency)}
        />
        <MetricCard
          icon="✓"
          label="Utilidad neta"
          value={money(dashboard.netProfit, dashboard.currency)}
          trend={`${dashboard.marginPercent.toFixed(2)}% margen neto`}
        />
        <MetricCard
          icon="◎"
          label="Punto de equilibrio"
          value={money(dashboard.breakEven, dashboard.currency)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon="▥"
          label="Utilidad bruta"
          value={money(dashboard.grossProfit, dashboard.currency)}
        />
        <MetricCard
          icon="▣"
          label="Costo fijo mensual"
          value={money(dashboard.fixedMonthlyCost, dashboard.currency)}
        />
        <MetricCard
          icon="◌"
          label="Costo variable"
          value={money(dashboard.variableCost, dashboard.currency)}
        />
        <MetricCard
          icon="⌁"
          label="Caja estimada"
          value={money(dashboard.estimatedCash, dashboard.currency)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          icon="↻"
          label="MRR"
          value={money(dashboard.mrr, dashboard.currency)}
          trend="Suscripciones activas normalizadas a mes"
        />
        <MetricCard
          icon="⇧"
          label="ARR"
          value={money(dashboard.arr, dashboard.currency)}
          trend="MRR anualizado"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Ingresos vs gastos · últimos 12 meses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {dashboard.monthlyTrend.map((row) => {
            const max = Math.max(Number(row.revenue), Number(row.expenses), 1);
            return (
              <div
                className="grid grid-cols-[70px_1fr_110px] items-center gap-3 text-xs"
                key={row.month}
              >
                <span className="font-semibold text-content-secondary">{row.month}</span>
                <div className="space-y-1">
                  <div
                    className="h-2 rounded-full bg-brand-500"
                    style={{ width: `${(Number(row.revenue) / max) * 100}%` }}
                  />
                  <div
                    className="h-2 rounded-full bg-rose-400"
                    style={{ width: `${(Number(row.expenses) / max) * 100}%` }}
                  />
                </div>
                <span className="text-right font-semibold text-content-primary">
                  {Number(row.netProfit).toLocaleString('es-CL')}
                </span>
              </div>
            );
          })}
          <div className="flex gap-4 pt-2 text-xs text-content-muted">
            <span>● Ingresos</span>
            <span className="text-rose-400">● Gastos</span>
            <span>Utilidad neta</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Próximos gastos recurrentes</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.upcomingRecurringExpenses.length === 0 ? (
            <EmptyState
              title="Sin recurrencias próximas"
              description="Los gastos recurrentes aparecerán aquí antes de su siguiente ocurrencia."
            />
          ) : (
            <div className="divide-y divide-border-subtle">
              {dashboard.upcomingRecurringExpenses.map((expense) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                  key={expense.id}
                >
                  <span className="font-semibold text-content-primary">{expense.name}</span>
                  <span className="text-content-secondary">
                    {money(expense.amount, expense.currency)} ·{' '}
                    {expense.nextOccurrenceDate
                      ? new Date(expense.nextOccurrenceDate).toLocaleDateString('es-CL')
                      : 'sin fecha'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export function FinancialExpensesPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: '',
    currency: 'CLP',
    paymentMethod: 'TRANSFER',
    frequency: 'ONE_TIME',
    description: '',
    vendorName: '',
    categoryId: '',
  });
  const categories = useQuery({
    queryKey: ['financial-categories'],
    queryFn: api.getFinancialCategories,
  });
  const expenses = useQuery({
    queryKey: ['financial-expenses', search],
    queryFn: () => api.getFinancialExpenses(queryString({ search, limit: 50 })),
  });
  const create = useMutation({
    mutationFn: api.createFinancialExpense,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial-expenses'] });
      toast({ title: 'Gasto registrado', tone: 'success' });
      setForm((value) => ({ ...value, amount: '', description: '' }));
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible registrar el gasto',
        description: error.message,
        tone: 'error',
      }),
  });
  const generate = useMutation({
    mutationFn: api.generateRecurringExpenses,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['financial-expenses'] });
      toast({ title: `${result.generated} ocurrencias generadas`, tone: 'success' });
    },
  });
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Finanzas"
        title="Gastos"
        description="Registra egresos y conserva el histórico de sus ocurrencias."
        actions={
          <Button onClick={() => generate.mutate()} disabled={generate.isPending} variant="outline">
            {generate.isPending ? 'Generando…' : 'Generar recurrentes'}
          </Button>
        }
      />
      <FinanceTabs />
      <Card>
        <CardHeader>
          <CardTitle>Nuevo gasto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-content-secondary">
            Fecha
            <Input
              className="mt-1"
              type="date"
              value={form.expenseDate}
              onChange={(event) => update('expenseDate', event.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-content-secondary">
            Monto
            <Input
              className="mt-1"
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => update('amount', event.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="text-xs font-semibold text-content-secondary">
            Moneda
            <Select
              className="mt-1"
              value={form.currency}
              onChange={(event) => update('currency', event.target.value)}
            >
              {CURRENCIES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </label>
          <label className="text-xs font-semibold text-content-secondary">
            Categoría
            <Select
              className="mt-1"
              value={form.categoryId}
              onChange={(event) => update('categoryId', event.target.value)}
            >
              <option value="">Sin categoría</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs font-semibold text-content-secondary">
            Proveedor
            <Input
              className="mt-1"
              value={form.vendorName}
              onChange={(event) => update('vendorName', event.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-content-secondary">
            Forma de pago
            <Select
              className="mt-1"
              value={form.paymentMethod}
              onChange={(event) => update('paymentMethod', event.target.value)}
            >
              {PAYMENT_METHODS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </label>
          <label className="text-xs font-semibold text-content-secondary">
            Frecuencia
            <Select
              className="mt-1"
              value={form.frequency}
              onChange={(event) => update('frequency', event.target.value)}
            >
              {FREQUENCIES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </label>
          <label className="text-xs font-semibold text-content-secondary sm:col-span-2 lg:col-span-1">
            Descripción
            <Textarea
              className="mt-1"
              value={form.description}
              onChange={(event) => update('description', event.target.value)}
            />
          </label>
          <div className="flex items-end">
            <Button
              disabled={create.isPending || !form.amount}
              onClick={() =>
                create.mutate({
                  ...form,
                  ...(form.categoryId ? { categoryId: form.categoryId } : {}),
                })
              }
            >
              {create.isPending ? 'Guardando…' : 'Registrar gasto'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <Input
            className="max-w-xs"
            placeholder="Buscar proveedor o descripción"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {expenses.isLoading ? (
            <div className="p-5 text-sm text-content-muted">Cargando gastos…</div>
          ) : expenses.data?.data.length ? (
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-surface-muted text-xs uppercase text-content-muted">
                <tr>
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Descripción</th>
                  <th className="px-5 py-3">Categoría</th>
                  <th className="px-5 py-3">Monto</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {expenses.data.data.map((expense: FinancialExpense) => (
                  <tr key={expense.id}>
                    <td className="px-5 py-3 text-content-secondary">
                      {new Date(expense.expenseDate).toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-5 py-3 font-semibold text-content-primary">
                      {expense.description ?? expense.vendorName ?? 'Sin descripción'}
                    </td>
                    <td className="px-5 py-3 text-content-secondary">
                      {expense.category?.name ?? 'Sin categoría'}
                    </td>
                    <td className="px-5 py-3 font-semibold text-content-primary">
                      {money(expense.amount, expense.currency)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={expense.generated ? 'GENERATED' : 'ACTIVE'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title="Sin gastos"
              description="Registra el primer gasto para activar el dashboard financiero."
            />
          )}
        </CardContent>
      </Card>
    </PageGrid>
  );
}

export function FinancialCategoriesPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const [name, setName] = useState('');
  const categories = useQuery({
    queryKey: ['financial-categories'],
    queryFn: api.getFinancialCategories,
  });
  const create = useMutation({
    mutationFn: api.createFinancialCategory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial-categories'] });
      setName('');
      toast({ title: 'Categoría creada', tone: 'success' });
    },
  });
  const archive = useMutation({
    mutationFn: api.archiveFinancialCategory,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['financial-categories'] }),
  });
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Finanzas"
        title="Categorías"
        description="Clasifica los gastos para separar costos fijos, variables y publicidad."
      />
      <FinanceTabs />
      <Card>
        <CardHeader>
          <CardTitle>Nueva categoría</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            className="max-w-sm"
            placeholder="Ej. Publicidad"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate({ name })}
          >
            Crear categoría
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.data?.map((category) => (
            <div
              className="flex items-center justify-between rounded-xl border border-border-default bg-surface-muted p-3"
              key={category.id}
            >
              <div>
                <p className="font-semibold text-content-primary">{category.name}</p>
                <Badge className="mt-1 bg-surface-card text-content-muted">
                  {category.active ? 'Activa' : 'Inactiva'}
                </Badge>
              </div>
              <Button size="sm" variant="ghost" onClick={() => archive.mutate(category.id)}>
                Archivar
              </Button>
            </div>
          )) ?? (
            <EmptyState
              title="Sin categorías"
              description="Crea una categoría para ordenar tus egresos."
            />
          )}
        </CardContent>
      </Card>
    </PageGrid>
  );
}
