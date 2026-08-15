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
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { JsonRecord } from '@/lib/types';

function money(items: Array<{ currency: string; amount: string }>): string {
  const item = items[0];
  return item ? `${item.currency} ${Number(item.amount).toLocaleString('es-CL')}` : '—';
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
    queryFn: () => api.getOffers('?limit=100'),
  });
  const create = useMutation({
    mutationFn: (body: JsonRecord) => api.upsertDailyMetric(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['operational-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
      setDrawerOpen(false);
      toast({
        title: 'Día registrado',
        description: 'La fila quedó disponible para editarse.',
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible registrar el día',
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
            actions={<Button onClick={() => setDrawerOpen(true)}>＋ Registrar día</Button>}
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
          <section
            aria-label="Actividad de hoy"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard
              icon="◷"
              label="Conversaciones hoy"
              value={metric(data.today.conversations)}
              trend={`${data.today.demos} demos`}
            />
            <MetricCard
              icon="↗"
              label="Ventas del mes"
              value={metric(data.month.sales)}
              trend={`${data.today.followups} seguimientos hoy`}
            />
            <MetricCard
              icon="$"
              label="Facturación del mes"
              value={money(data.month.grossBilling)}
              trend="Ventas confirmadas o cumplidas"
            />
            <MetricCard
              icon="✓"
              label="Cobros pendientes"
              value={money(
                data.pendingCollections.map((item) => ({
                  currency: item.currency,
                  amount: item.balance,
                })),
              )}
              trend="Saldo calculado desde pagos"
            />
          </section>
          <section
            aria-label="Métricas del mes"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard
              icon="✦"
              label="Demos del mes"
              value={metric(data.month.demos)}
              trend={`${data.month.conversionConversationToDemo}% conversación → demo`}
            />
            <MetricCard
              icon="%"
              label="Conversión a venta"
              value={`${data.month.conversionConversationToSale}%`}
              trend={`${data.month.conversionDemoToSale}% demo → venta`}
            />
            <MetricCard
              icon="◉"
              label="Utilidad"
              value={money(data.month.profit)}
              trend={`Margen operativo desde cobros`}
            />
            <MetricCard
              icon="⌁"
              label="ROAS"
              value={data.month.roas}
              trend={`CPA ${data.month.cpa}`}
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
        description="Una fila por campaña y país. Si existe, se actualiza en lugar de duplicarse."
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        title="Registrar día operativo"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            create.mutate({
              metricDate: String(form.get('metricDate') ?? todayIso()),
              country: String(form.get('country') ?? 'CL'),
              ...(String(form.get('campaignId') ?? '')
                ? { campaignId: String(form.get('campaignId')) }
                : {}),
              ...(String(form.get('campaignName') ?? '').trim()
                ? { campaignName: String(form.get('campaignName')).trim(), platform: 'MANUAL' }
                : {}),
              conversations: Number(form.get('conversations') ?? 0),
              demos: Number(form.get('demos') ?? 0),
              salesCount: Number(form.get('salesCount') ?? 0),
              adSpend: String(form.get('adSpend') ?? '0'),
              ...(String(form.get('grossRevenue') ?? '')
                ? { grossRevenue: String(form.get('grossRevenue')) }
                : {}),
              currency: String(form.get('currency') ?? 'USD'),
              notes: String(form.get('notes') ?? ''),
            });
          }}
        >
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Fecha</span>
            <Input defaultValue={todayIso()} name="metricDate" required type="date" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>País</span>
              <Select defaultValue="CL" name="country">
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
              <Select defaultValue="" name="campaignId">
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
            <Input name="campaignName" placeholder="Ej. Meta agosto Chile" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Conversaciones</span>
              <Input defaultValue="0" min="0" name="conversations" type="number" />
            </label>
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Demos</span>
              <Input defaultValue="0" min="0" name="demos" type="number" />
            </label>
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Ventas informativas</span>
              <Input defaultValue="0" min="0" name="salesCount" type="number" />
            </label>
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Gasto publicitario</span>
              <Input defaultValue="0" min="0" name="adSpend" step="0.01" type="number" />
            </label>
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Facturación opcional</span>
              <Input min="0" name="grossRevenue" step="0.01" type="number" />
            </label>
            <label className="space-y-1 text-sm font-semibold text-content-primary">
              <span>Moneda</span>
              <Input defaultValue="USD" maxLength={3} name="currency" />
            </label>
          </div>
          <label className="space-y-1 text-sm font-semibold text-content-primary">
            <span>Notas</span>
            <Textarea name="notes" />
          </label>
          <Button className="w-full" disabled={create.isPending} type="submit">
            {create.isPending ? 'Guardando…' : 'Guardar día'}
          </Button>
        </form>
      </Drawer>
    </QueryState>
  );
}
