'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer } from '@/components/ui/drawer';
import { Input, Select, Textarea } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import { PermissionGate } from '@/components/ui/permission-gate';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { DailyMetric, JsonRecord } from '@/lib/types';

function formatMoneyItem(item?: { currency: string; amount: string } | null): string {
  if (!item) return '—';
  const num = Number(item.amount);
  if (!Number.isFinite(num)) return '—';
  if (item.currency === 'CLP') {
    return `$${Math.round(num).toLocaleString('es-CL')}`;
  }
  if (item.currency === 'USD') {
    return `US$ ${num.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${item.currency} ${num.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUsd(amount?: string | null): string {
  if (!amount) return '—';
  const num = Number(amount);
  if (!Number.isFinite(num)) return '—';
  return `US$ ${num.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function money(
  items: Array<{ currency: string; amount: string }> | undefined,
  usdValue?: string,
): string {
  if (usdValue !== undefined && usdValue !== null) {
    return formatUsd(usdValue);
  }
  if (!items || !items.length) return '—';
  const item = items[0];
  return formatMoneyItem(item);
}

function metric(value: number | string): string {
  return typeof value === 'number' ? value.toLocaleString('es-CL') : value;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OperationalDashboardPage(): React.ReactElement {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [country, setCountry] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [productId, setProductId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<DailyMetric | null>(null);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const query = queryString({
    from: from || undefined,
    to: to || undefined,
    country: country || undefined,
    campaignId: campaignId || undefined,
    productId: productId || undefined,
  });
  const dashboard = useQuery({
    queryKey: ['operational-dashboard', from, to, country, campaignId, productId],
    queryFn: () => api.getOperationalDashboard(query),
    staleTime: 30_000,
  });
  const metrics = useQuery({
    queryKey: ['daily-metrics', from, to, country, campaignId],
    queryFn: () =>
      api.getDailyMetrics(
        queryString({
          from: from || undefined,
          to: to || undefined,
          country: country || undefined,
          campaignId: campaignId || undefined,
          page: 1,
          limit: 50,
        }),
      ),
  });
  const campaigns = useQuery({
    queryKey: ['marketing-campaigns', 'operational'],
    queryFn: () => api.getMarketingCampaigns('?page=1&limit=100&active=true'),
  });
  const products = useQuery({
    queryKey: ['catalog-offers', 'operational'],
    queryFn: () => api.getOffers('?customerSegment=ANY&currency=USD&limit=100'),
  });
  const save = useMutation({
    mutationFn: (input: { id?: string; body: JsonRecord }) =>
      input.id ? api.updateDailyMetric(input.id, input.body) : api.upsertDailyMetric(input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['operational-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
      setDrawerOpen(false);
      setEditingMetric(null);
      toast({
        title: editingMetric ? 'Día actualizado' : 'Día registrado',
        description: 'La actividad manual quedó reflejada en el período.',
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible guardar el día',
        description: error.message,
        tone: 'error',
      }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDailyMetric(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['operational-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
      toast({ title: 'Registro archivado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible archivar el registro',
        description: error.message,
        tone: 'error',
      }),
  });
  const data = dashboard.data;
  return (
    <QueryState
      isError={dashboard.isError}
      isLoading={dashboard.isLoading}
      onRetry={() => void dashboard.refetch()}
    >
      {data ? (
        <PageGrid>
          <PageHeader
            eyebrow="Sistema operativo comercial"
            title="Dashboard operativo"
            description="Registra la actividad manual del día y separa las señales comerciales de la facturación real."
            actions={
              <PermissionGate permission="operations.manage">
                <Button
                  onClick={() => {
                    setEditingMetric(null);
                    setDrawerOpen(true);
                  }}
                >
                  ＋ Registrar día
                </Button>
              </PermissionGate>
            }
          />
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <label className="space-y-1 text-xs font-semibold text-content-secondary">
                <span>Desde</span>
                <Input
                  aria-label="Desde"
                  onChange={(event) => setFrom(event.target.value)}
                  type="date"
                  value={from}
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-content-secondary">
                <span>Hasta</span>
                <Input
                  aria-label="Hasta"
                  onChange={(event) => setTo(event.target.value)}
                  type="date"
                  value={to}
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-content-secondary">
                <span>País</span>
                <Select
                  aria-label="País"
                  onChange={(event) => setCountry(event.target.value)}
                  value={country}
                >
                  <option value="">Todos</option>
                  <option value="CL">Chile</option>
                  <option value="MX">México</option>
                  <option value="PE">Perú</option>
                  <option value="BO">Bolivia</option>
                  <option value="EC">Ecuador</option>
                  <option value="US">Estados Unidos</option>
                </Select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-content-secondary">
                <span>Campaña</span>
                <Select
                  aria-label="Campaña"
                  onChange={(event) => setCampaignId(event.target.value)}
                  value={campaignId}
                >
                  <option value="">Todas</option>
                  {(campaigns.data?.data ?? []).map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-content-secondary">
                <span>Producto</span>
                <Select
                  aria-label="Producto"
                  onChange={(event) => setProductId(event.target.value)}
                  value={productId}
                >
                  <option value="">Todos</option>
                  {(products.data?.data ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={() => {
                    setFrom('');
                    setTo('');
                    setCountry('');
                    setCampaignId('');
                    setProductId('');
                  }}
                  variant="outline"
                >
                  Limpiar filtros
                </Button>
              </div>
            </div>
          </Card>
          <section aria-label="Resumen de hoy" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon="◷"
              label="Conversaciones hoy"
              value={metric(data.today.conversations)}
              trend={`${data.today.demos} demos`}
            />
            <MetricCard
              icon="↗"
              label="Ventas reales hoy"
              value={metric(data.today.sales)}
              trend={`${data.today.renewals} renovaciones hoy`}
            />
            <MetricCard
              icon="$"
              label="Cobros recibidos hoy"
              value={money(data.today.confirmedPayments, data.today.usdGrossPayments)}
              trend="Pagos confirmados (USD)"
            />
            <MetricCard
              icon="◉"
              label="Gastos de hoy"
              value={money(data.today.expenses, data.today.usdExpenses)}
              trend="Expense real (USD)"
            />
          </section>
          <section
            aria-label="Métricas del mes y pendientes"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard
              icon="✦"
              label="Resultado de hoy"
              value={money(data.today.profit, data.today.usdProfit)}
              trend="Cobros recibidos menos gastos (USD)"
            />
            <MetricCard
              icon="%"
              label="Cobros pendientes"
              value={
                Array.isArray(data.pendingCollections)
                  ? money(
                      data.pendingCollections.map((item) => ({
                        currency: item.currency,
                        amount: item.balance,
                      })),
                    )
                  : formatUsd(data.pendingCollections.totalUsd)
              }
              trend="Saldo total por recaudar (USD)"
            />
            <MetricCard
              icon="⌁"
              label="Renovaciones próximas"
              value={metric(data.renewalsDueSoon)}
              trend="Ventana operativa de 7 días"
            />
            <MetricCard
              icon="✓"
              label="Seguimientos hoy"
              value={metric(data.today.followups)}
              trend="Pendientes del día"
            />
          </section>
          <Card>
            <CardHeader>
              <CardTitle>Resumen del día (Consolidado USD)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl bg-surface-muted p-3">
                <p className="text-xs text-content-muted">Ventas</p>
                <p className="mt-1 font-bold text-content-primary">{metric(data.today.sales)}</p>
              </div>
              <div className="rounded-xl bg-surface-muted p-3">
                <p className="text-xs text-content-muted">Facturación bruta</p>
                <p className="mt-1 font-bold text-content-primary">
                  {money(data.today.grossBilling, data.today.usdGrossBilling)}
                </p>
              </div>
              <div className="rounded-xl bg-surface-muted p-3">
                <p className="text-xs text-content-muted">Cobros recibidos</p>
                <p className="mt-1 font-bold text-content-primary">
                  {money(data.today.confirmedPayments, data.today.usdGrossPayments)}
                </p>
              </div>
              <div className="rounded-xl bg-surface-muted p-3">
                <p className="text-xs text-content-muted">Gastos</p>
                <p className="mt-1 font-bold text-content-primary">
                  {money(data.today.expenses, data.today.usdExpenses)}
                </p>
              </div>
              <div className="rounded-xl bg-surface-muted p-3">
                <p className="text-xs text-content-muted">Resultado</p>
                <p className="mt-1 font-bold text-content-primary">
                  {money(data.today.profit, data.today.usdProfit)}
                </p>
              </div>
            </CardContent>
          </Card>
          <section
            aria-label="Resumen mensual"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard
              icon="↗"
              label="Ventas del mes"
              value={metric(data.month.sales)}
              trend={`${data.month.conversionConversationToSale}% conversación → venta`}
            />
            <MetricCard
              icon="$"
              label="Ingresos netos del mes"
              value={money(data.month.netIncome, data.month.usdNetIncome)}
              trend="Cobros confirmados menos comisiones (USD)"
            />
            <MetricCard
              icon="◉"
              label="Gastos del mes"
              value={money(data.month.expenses, data.month.usdExpenses)}
              trend="Gastos reales consolidados (USD)"
            />
            <MetricCard
              icon="⌁"
              label="Resultado del mes"
              value={money(data.month.profit, data.month.usdProfit)}
              trend={`ROAS ${data.month.roas} · CPA ${data.month.cpa}`}
            />
          </section>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Registro manual</CardTitle>
                  <p className="mt-1 text-xs text-content-secondary">
                    Ventas informativas no se mezclan con las ventas financieras.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-b border-border-subtle text-xs text-content-muted">
                    <tr>
                      <th className="px-5 py-3">Fecha</th>
                      <th className="px-5 py-3">Campaña</th>
                      <th className="px-5 py-3">País</th>
                      <th className="px-5 py-3">Conversaciones</th>
                      <th className="px-5 py-3">Demos</th>
                      <th className="px-5 py-3">Gasto</th>
                      <th className="px-5 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics.data?.data ?? []).map((row) => (
                      <tr className="border-b border-border-subtle last:border-0" key={row.id}>
                        <td className="px-5 py-3 text-content-primary">{row.metricDate}</td>
                        <td className="px-5 py-3 text-content-primary">
                          {row.campaign?.name ?? 'Sin campaña'}
                        </td>
                        <td className="px-5 py-3 text-content-secondary">{row.country}</td>
                        <td className="px-5 py-3 text-content-primary">{row.conversations}</td>
                        <td className="px-5 py-3 text-content-primary">{row.demos}</td>
                        <td className="px-5 py-3 text-content-primary">
                          {row.currency} {row.adSpend}
                        </td>
                        <td className="px-5 py-3">
                          <PermissionGate permission="operations.manage">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={() => {
                                  setEditingMetric(row);
                                  setDrawerOpen(true);
                                }}
                                size="sm"
                                variant="outline"
                              >
                                Editar
                              </Button>
                              <Button
                                disabled={remove.isPending}
                                onClick={() => {
                                  if (window.confirm('¿Archivar este registro del día?'))
                                    remove.mutate(row.id);
                                }}
                                size="sm"
                                variant="ghost"
                              >
                                Archivar
                              </Button>
                            </div>
                          </PermissionGate>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!metrics.data?.data.length ? (
                  <p className="p-6 text-sm text-content-muted">
                    Todavía no hay filas para este período. Registra el primer día.
                  </p>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Por país</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.byCountry.length ? (
                  data.byCountry.map((row) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted p-3"
                      key={row.country}
                    >
                      <div>
                        <p className="font-bold text-content-primary">{row.country}</p>
                        <p className="text-xs text-content-muted">
                          {row.conversations} conversaciones · {row.demos} demos
                        </p>
                      </div>
                      <p className="text-sm font-bold text-content-primary">{row.grossRevenue}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-content-muted">Sin actividad registrada por país.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-content-muted">
            Fuente financiera: {data.sourceOfTruth.financialSales}. Fuente de actividad:{' '}
            {data.sourceOfTruth.manualActivity}.
          </p>
        </PageGrid>
      ) : null}
      <Drawer
        description={
          editingMetric
            ? 'Actualiza la actividad manual registrada para este día.'
            : 'Una fila por campaña y país. Si existe, se actualiza en lugar de duplicarse.'
        }
        onClose={() => {
          setDrawerOpen(false);
          setEditingMetric(null);
        }}
        open={drawerOpen}
        title={editingMetric ? 'Editar día operativo' : 'Registrar día operativo'}
      >
        <form
          key={editingMetric?.id ?? 'new-daily-metric'}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const body: JsonRecord = {
              conversations: Number(form.get('conversations') ?? 0),
              demos: Number(form.get('demos') ?? 0),
              salesCount: Number(form.get('salesCount') ?? 0),
              adSpend: String(form.get('adSpend') ?? '0'),
              ...(String(form.get('grossRevenue') ?? '')
                ? { grossRevenue: String(form.get('grossRevenue')) }
                : {}),
              notes: String(form.get('notes') ?? ''),
            };
            if (!editingMetric) {
              Object.assign(body, {
                metricDate: String(form.get('metricDate') ?? todayIso()),
                country: String(form.get('country') ?? 'CL'),
                ...(String(form.get('campaignId') ?? '')
                  ? { campaignId: String(form.get('campaignId')) }
                  : {}),
                ...(String(form.get('campaignName') ?? '').trim()
                  ? { campaignName: String(form.get('campaignName')).trim(), platform: 'MANUAL' }
                  : {}),
                currency: String(form.get('currency') ?? 'USD'),
              });
            }
            save.mutate(editingMetric ? { id: editingMetric.id, body } : { body });
          }}
        >
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Fecha</span>
            <Input
              defaultValue={editingMetric?.metricDate ?? todayIso()}
              disabled={Boolean(editingMetric)}
              name="metricDate"
              required
              type="date"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>País</span>
              <Select
                defaultValue={editingMetric?.country ?? 'CL'}
                disabled={Boolean(editingMetric)}
                name="country"
              >
                <option value="CL">Chile</option>
                <option value="MX">México</option>
                <option value="PE">Perú</option>
                <option value="BO">Bolivia</option>
                <option value="EC">Ecuador</option>
                <option value="US">Estados Unidos</option>
                <option value="GLOBAL">Global</option>
              </Select>
            </label>
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Campaña existente</span>
              <Select
                defaultValue={editingMetric?.campaign?.id ?? ''}
                disabled={Boolean(editingMetric)}
                name="campaignId"
              >
                <option value="">Sin campaña</option>
                {(campaigns.data?.data ?? []).map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Campaña rápida (si no eliges una existente)</span>
            <Input
              disabled={Boolean(editingMetric)}
              name="campaignName"
              placeholder="Ej. Meta agosto Chile"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Conversaciones</span>
              <Input
                defaultValue={editingMetric?.conversations ?? 0}
                min="0"
                name="conversations"
                type="number"
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Demos</span>
              <Input defaultValue={editingMetric?.demos ?? 0} min="0" name="demos" type="number" />
            </label>
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Ventas informativas</span>
              <Input
                defaultValue={editingMetric?.salesCount ?? 0}
                min="0"
                name="salesCount"
                type="number"
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Gasto publicitario</span>
              <Input
                defaultValue={editingMetric?.adSpend ?? '0'}
                min="0"
                name="adSpend"
                step="0.01"
                type="number"
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Facturación opcional</span>
              <Input
                defaultValue={editingMetric?.grossRevenue ?? ''}
                min="0"
                name="grossRevenue"
                step="0.01"
                type="number"
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Moneda</span>
              <Input
                defaultValue={editingMetric?.currency ?? 'USD'}
                disabled={Boolean(editingMetric)}
                maxLength={3}
                name="currency"
              />
            </label>
          </div>
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Notas</span>
            <Textarea defaultValue={editingMetric?.notes ?? ''} name="notes" />
          </label>
          <Button className="w-full" disabled={save.isPending} type="submit">
            {save.isPending ? 'Guardando…' : editingMetric ? 'Guardar cambios' : 'Guardar día'}
          </Button>
        </form>
      </Drawer>
    </QueryState>
  );
}
