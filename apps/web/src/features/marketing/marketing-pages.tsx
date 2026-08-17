'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
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
import type {
  Contact,
  MarketingAttribution,
  MarketingCampaign,
  MarketingLossReason,
  MarketingPerformanceMetric,
  MarketingSpend,
} from '@/lib/types';

type MarketingView = 'overview' | 'campaigns' | 'spend' | 'attribution' | 'prospects' | 'imports';

function contactLabel(contact: Contact): string {
  return (
    contact.displayName ||
    `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() ||
    contact.email ||
    contact.phone ||
    'Contacto sin nombre'
  );
}

const tabs: Array<{ href: string; view: MarketingView; label: string }> = [
  { href: '/marketing', view: 'overview', label: 'Rendimiento' },
  { href: '/marketing/campaigns', view: 'campaigns', label: 'Campañas' },
  { href: '/marketing/spend', view: 'spend', label: 'Gasto' },
  { href: '/marketing/attribution', view: 'attribution', label: 'Atribución' },
  { href: '/marketing/prospects', view: 'prospects', label: 'Prospectos' },
  { href: '/marketing/imports', view: 'imports', label: 'Importaciones' },
];

function MarketingTabs({ active }: { readonly active: MarketingView }): React.ReactElement {
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Marketing y atribución">
      {tabs.map((tab) => (
        <Link href={tab.href} key={tab.href}>
          <Button
            className="shrink-0"
            variant={tab.view === active ? 'primary' : 'outline'}
            size="sm"
          >
            {tab.label}
          </Button>
        </Link>
      ))}
    </nav>
  );
}

function money(value: string | null, currency = '—'): string {
  if (value === null) return '—';
  return `${currency} ${Number(value).toLocaleString('es-CL', { maximumFractionDigits: 2 })}`;
}

function MarketingLayout({
  active,
  children,
  description,
  title,
}: {
  readonly active: MarketingView;
  readonly children: React.ReactNode;
  readonly description: string;
  readonly title: string;
}): React.ReactElement {
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Marketing · Commercial Attribution"
        title={title}
        description={description}
      />
      <MarketingTabs active={active} />
      {children}
    </PageGrid>
  );
}

export function MarketingOverviewPage(): React.ReactElement {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [currency, setCurrency] = useState('');
  const query = useMemo(() => queryString({ from, to, currency }), [from, to, currency]);
  const performance = useQuery({
    queryKey: ['marketing-performance', query],
    queryFn: () => api.getMarketingPerformance(query),
  });
  const performanceRows = performance.data?.data;
  const rows = useMemo(() => performanceRows ?? [], [performanceRows]);
  const currencyTotals = useMemo(() => {
    const totals = new Map<string, { spend: number; revenue: number; profit: number }>();
    rows.forEach((row) => {
      const current = totals.get(row.currency) ?? {
        spend: 0,
        revenue: 0,
        profit: 0,
      };
      current.spend += Number(row.spend);
      current.revenue += Number(row.netRevenue);
      current.profit += Number(row.profit ?? 0);
      totals.set(row.currency, current);
    });
    return [...totals.entries()].map(([currencyCode, total]) => ({
      currency: currencyCode,
      ...total,
    }));
  }, [rows]);
  const funnelTotals = useMemo(() => {
    const campaignRows = new Map<string, MarketingPerformanceMetric>();
    rows.forEach((row) => {
      const current = campaignRows.get(row.campaignId);
      campaignRows.set(row.campaignId, {
        ...row,
        sales: (current?.sales ?? 0) + row.sales,
        conversations: current?.conversations ?? row.conversations,
        contacts: current?.contacts ?? row.contacts,
        demos: current?.demos ?? row.demos,
      });
    });
    return [...campaignRows.values()].reduce(
      (result, row) => ({
        conversations: result.conversations + row.conversations,
        contacts: result.contacts + row.contacts,
        demos: result.demos + row.demos,
        sales: result.sales + row.sales,
      }),
      { conversations: 0, contacts: 0, demos: 0, sales: 0 },
    );
  }, [rows]);
  return (
    <MarketingLayout
      active="overview"
      title="Rendimiento de campañas"
      description="Atribución, gasto y rentabilidad comercial calculados sobre los datos transaccionales existentes."
    >
      <Card>
        <CardContent className="grid gap-3 p-3 sm:grid-cols-3 sm:p-4">
          <label className="text-xs font-semibold text-content-secondary">
            Desde
            <Input
              className="mt-1"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-content-secondary">
            Hasta
            <Input
              className="mt-1"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-content-secondary">
            Moneda
            <Select
              className="mt-1"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option value="">Todas</option>
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="MXN">MXN</option>
              <option value="PEN">PEN</option>
            </Select>
          </label>
        </CardContent>
      </Card>
      <QueryState
        isLoading={performance.isLoading}
        isError={performance.isError}
        onRetry={() => void performance.refetch()}
      >
        {rows.length === 0 ? (
          <EmptyState
            title="Sin rendimiento todavía"
            description="Registra una campaña, gasto y atribución para comenzar a medir."
          />
        ) : (
          <>
            {currencyTotals.map((total) => {
              const roas = total.spend > 0 ? total.revenue / total.spend : null;
              return (
                <section aria-label={`Resumen ${total.currency}`} key={total.currency}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-content-muted">
                    Resumen en {total.currency}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <MetricCard
                      icon="$"
                      label="Gasto"
                      value={money(total.spend.toFixed(2), total.currency)}
                    />
                    <MetricCard
                      icon="↗"
                      label="Ingresos netos"
                      value={money(total.revenue.toFixed(2), total.currency)}
                    />
                    <MetricCard
                      icon="✓"
                      label="Utilidad"
                      value={money(total.profit.toFixed(2), total.currency)}
                    />
                    <MetricCard
                      icon="◎"
                      label="ROAS neto"
                      value={roas === null ? '—' : `${roas.toFixed(2)}x`}
                    />
                  </div>
                </section>
              );
            })}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon="#" label="Ventas" value={String(funnelTotals.sales)} />
              <MetricCard
                icon="◌"
                label="Conversaciones"
                value={String(funnelTotals.conversations)}
              />
              <MetricCard icon="+" label="Contactos" value={String(funnelTotals.contacts)} />
              <MetricCard icon="◇" label="Demos" value={String(funnelTotals.demos)} />
            </div>
            <PerformanceTable rows={rows} />
          </>
        )}
      </QueryState>
    </MarketingLayout>
  );
}

function PerformanceTable({
  rows,
}: {
  readonly rows: MarketingPerformanceMetric[];
}): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Campañas · rendimiento y rentabilidad</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="min-w-[920px] w-full text-left text-xs">
          <thead className="border-b border-border-subtle text-content-muted">
            <tr>
              {[
                'Campaña',
                'Embudo',
                'Gasto',
                'Ingresos',
                'Utilidad',
                'CPA',
                'ROAS',
                'Cierre promedio',
              ].map((heading) => (
                <th className="px-5 py-3 font-semibold" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <tr className="hover:bg-surface-muted/60" key={`${row.campaignId}-${row.currency}`}>
                <td className="px-5 py-3">
                  <p className="font-bold text-content-primary">{row.campaignName}</p>
                  <p className="text-content-muted">
                    {row.platform} · {row.source}
                  </p>
                </td>
                <td className="px-5 py-3 text-content-secondary">
                  {row.conversations} conv. · {row.demos} demos · {row.sales} ventas
                </td>
                <td className="px-5 py-3 font-semibold text-content-primary">
                  {money(row.spend, row.currency)}
                </td>
                <td className="px-5 py-3 font-semibold text-content-primary">
                  {money(row.netRevenue, row.currency)}
                </td>
                <td className="px-5 py-3 font-semibold text-content-primary">
                  {money(row.profit, row.currency)}
                </td>
                <td className="px-5 py-3 text-content-secondary">{money(row.cpa, row.currency)}</td>
                <td className="px-5 py-3 text-content-secondary">
                  {row.netRoas === null ? '—' : `${row.netRoas}x`}
                </td>
                <td className="px-5 py-3 text-content-secondary">
                  {row.averageTimeToSaleSeconds === null
                    ? '—'
                    : `${Math.round(row.averageTimeToSaleSeconds / 86400)} días`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function MarketingCampaignsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('META_ADS');
  const [source, setSource] = useState('PAID');
  const campaigns = useQuery({
    queryKey: ['marketing-campaigns'],
    queryFn: () => api.getMarketingCampaigns(),
  });
  const create = useMutation({
    mutationFn: () => api.createMarketingCampaign({ name, platform, source }),
    onSuccess: () => {
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      toast.push({
        title: 'Campaña creada',
        description: 'La campaña está disponible para atribución.',
        tone: 'success',
      });
    },
  });
  return (
    <MarketingLayout
      active="campaigns"
      title="Campañas y jerarquía"
      description="Administra campañas canónicas sin duplicar las reglas de gasto o atribución."
    >
      <Card>
        <CardHeader>
          <CardTitle>Nueva campaña</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_180px_180px_auto]"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <Input
              aria-label="Nombre de campaña"
              placeholder="Campaña de adquisición"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Input
              aria-label="Plataforma"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              required
            />
            <Input
              aria-label="Fuente"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              required
            />
            <Button disabled={create.isPending || name.trim().length < 2} type="submit">
              Crear
            </Button>
          </form>
        </CardContent>
      </Card>
      <QueryState
        isLoading={campaigns.isLoading}
        isError={campaigns.isError}
        onRetry={() => void campaigns.refetch()}
      >
        <CampaignTable campaigns={campaigns.data?.data ?? []} />
      </QueryState>
    </MarketingLayout>
  );
}

function CampaignTable({
  campaigns,
}: {
  readonly campaigns: MarketingCampaign[];
}): React.ReactElement {
  if (campaigns.length === 0)
    return (
      <EmptyState
        title="Sin campañas"
        description="Crea la primera campaña para habilitar gasto y atribución."
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Campañas registradas</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="border-b border-border-subtle text-xs text-content-muted">
            <tr>
              {['Nombre', 'Plataforma', 'País objetivo', 'Jerarquía', 'Estado'].map((heading) => (
                <th className="px-5 py-3" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td className="px-5 py-4 font-bold text-content-primary">
                  {campaign.name}
                  <span className="ml-2 text-xs font-normal text-content-muted">
                    {campaign.code ?? ''}
                  </span>
                </td>
                <td className="px-5 py-4 text-content-secondary">
                  {campaign.platform}
                  <br />
                  <span className="text-xs text-content-muted">{campaign.source}</span>
                </td>
                <td className="px-5 py-4 text-content-secondary">
                  {campaign.targetedCountry ?? 'Todos'}
                </td>
                <td className="px-5 py-4 text-content-secondary">
                  {campaign.counts.adSets} conjuntos · {campaign.counts.ads} anuncios ·{' '}
                  {campaign.counts.creatives} creativos
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={campaign.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function MarketingSpendPage(): React.ReactElement {
  const campaigns = useQuery({
    queryKey: ['marketing-campaigns'],
    queryFn: () => api.getMarketingCampaigns(),
  });
  const spend = useQuery({ queryKey: ['marketing-spend'], queryFn: () => api.getMarketingSpend() });
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const [campaignId, setCampaignId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CLP');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const create = useMutation({
    mutationFn: () => api.createMarketingSpend({ date, campaignId, amount, currency }),
    onSuccess: () => {
      setAmount('');
      void queryClient.invalidateQueries({ queryKey: ['marketing-spend'] });
      void queryClient.invalidateQueries({ queryKey: ['marketing-performance'] });
      toast.push({
        title: 'Gasto registrado',
        description: 'El gasto se incorporó al cálculo de rentabilidad.',
        tone: 'success',
      });
    },
  });
  return (
    <MarketingLayout
      active="spend"
      title="Gasto publicitario"
      description="Registra inversión con una única fuente financiera: Expense."
    >
      <Card>
        <CardHeader>
          <CardTitle>Registrar gasto</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <Select
              aria-label="Campaña"
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
              required
            >
              <option value="">Selecciona campaña</option>
              {(campaigns.data?.data ?? []).map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </Select>
            <Input
              aria-label="Monto"
              type="number"
              min="0"
              step="0.01"
              placeholder="Monto"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
            <Select
              aria-label="Moneda"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option>CLP</option>
              <option>USD</option>
              <option>EUR</option>
            </Select>
            <div className="flex gap-2">
              <Input
                aria-label="Fecha"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
              <Button disabled={create.isPending || !campaignId} type="submit">
                Guardar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <QueryState
        isLoading={spend.isLoading}
        isError={spend.isError}
        onRetry={() => void spend.refetch()}
      >
        <SpendTable rows={spend.data?.data ?? []} />
      </QueryState>
    </MarketingLayout>
  );
}

function SpendTable({ rows }: { readonly rows: MarketingSpend[] }): React.ReactElement {
  if (rows.length === 0)
    return (
      <EmptyState
        title="Sin gasto registrado"
        description="El gasto publicitario aparecerá aquí con su campaña y moneda."
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de gasto</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="border-b border-border-subtle text-xs text-content-muted">
            <tr>
              {['Fecha', 'Campaña', 'Monto', 'Embudo', 'Conversiones', 'Fuente'].map((heading) => (
                <th className="px-5 py-3" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-5 py-4 text-content-secondary">
                  {new Date(row.expenseDate).toLocaleDateString('es-CL')}
                </td>
                <td className="px-5 py-4 font-semibold text-content-primary">
                  {row.campaign?.name ?? '—'}
                </td>
                <td className="px-5 py-4 font-bold text-content-primary">
                  {money(row.amount, row.currency)}
                </td>
                <td className="px-5 py-4 text-content-secondary">
                  {row.adSet?.name ?? row.ad?.name ?? 'Campaña'}
                </td>
                <td className="px-5 py-4 text-content-secondary">
                  {row.conversations ?? 0} conv. · {row.contacts ?? 0} contactos
                </td>
                <td className="px-5 py-4">
                  <Badge>{row.source}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function MarketingAttributionPage(): React.ReactElement {
  const attributions = useQuery({
    queryKey: ['marketing-attribution'],
    queryFn: () => api.getMarketingAttribution(),
  });
  const [contactId, setContactId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [platform, setPlatform] = useState('META_ADS');
  const [source, setSource] = useState('PAID');
  const campaigns = useQuery({
    queryKey: ['marketing-campaigns'],
    queryFn: () => api.getMarketingCampaigns(),
  });
  const contacts = useQuery({
    queryKey: ['marketing-contact-options'],
    queryFn: () => api.getContacts('?page=1&limit=100&archived=false'),
  });
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const create = useMutation({
    mutationFn: () =>
      api.createMarketingAttribution({
        kind: 'ORIGINAL',
        contactId,
        campaignId: campaignId || undefined,
        platform,
        source,
      }),
    onSuccess: () => {
      setContactId('');
      void queryClient.invalidateQueries({ queryKey: ['marketing-attribution'] });
      toast.push({
        title: 'Atribución guardada',
        description: 'El contacto quedó vinculado al origen comercial.',
        tone: 'success',
      });
    },
  });
  return (
    <MarketingLayout
      active="attribution"
      title="Atribución comercial"
      description="Conserva la fuente original y las conversiones corregibles con auditoría."
    >
      <Card>
        <CardHeader>
          <CardTitle>Asignar atribución original</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <Select
              aria-label="Contacto"
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
              required
            >
              <option value="">Selecciona un contacto</option>
              {(contacts.data?.data ?? []).map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contactLabel(contact)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Campaña"
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
            >
              <option value="">Sin campaña</option>
              {(campaigns.data?.data ?? []).map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </Select>
            <Input
              aria-label="Plataforma"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              required
            />
            <div className="flex gap-2">
              <Input
                aria-label="Fuente"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                required
              />
              <Button disabled={create.isPending} type="submit">
                Asignar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <QueryState
        isLoading={attributions.isLoading}
        isError={attributions.isError}
        onRetry={() => void attributions.refetch()}
      >
        <AttributionTable rows={attributions.data ?? []} />
      </QueryState>
    </MarketingLayout>
  );
}

function AttributionTable({ rows }: { readonly rows: MarketingAttribution[] }): React.ReactElement {
  if (rows.length === 0)
    return (
      <EmptyState
        title="Sin atribuciones"
        description="Las atribuciones originales aparecerán aquí con su contacto y campaña."
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registro de atribución</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="border-b border-border-subtle text-xs text-content-muted">
            <tr>
              {['Tipo', 'Contacto', 'Campaña', 'Origen', 'País', 'Fecha'].map((heading) => (
                <th className="px-5 py-3" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-5 py-4">
                  <Badge>{row.kind}</Badge>
                </td>
                <td className="px-5 py-4 font-semibold text-content-primary">
                  {row.contact
                    ? `${row.contact.firstName ?? ''} ${row.contact.lastName ?? ''}`.trim() ||
                      row.contact.id
                    : '—'}
                </td>
                <td className="px-5 py-4 text-content-secondary">
                  {row.campaign?.name ?? 'Orgánico / directo'}
                </td>
                <td className="px-5 py-4 text-content-secondary">
                  {row.platform} · {row.source}
                </td>
                <td className="px-5 py-4 text-content-secondary">
                  {row.actualCountry ?? row.targetedCountry ?? '—'}
                </td>
                <td className="px-5 py-4 text-content-secondary">
                  {new Date(row.acquiredAt).toLocaleDateString('es-CL')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function MarketingProspectsPage(): React.ReactElement {
  const reasons = useQuery({
    queryKey: ['marketing-loss-reasons'],
    queryFn: () => api.getMarketingLossReasons(),
  });
  const contacts = useQuery({
    queryKey: ['marketing-contact-options'],
    queryFn: () => api.getContacts('?page=1&limit=100&archived=false'),
  });
  const [contactId, setContactId] = useState('');
  const [state, setState] = useState('NEW_UNANSWERED');
  const [reasonId, setReasonId] = useState('');
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const change = useMutation({
    mutationFn: () => api.changeProspectState(contactId, { state }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospect-state', contactId] });
      toast.push({
        title: 'Estado actualizado',
        description: 'El estado del prospecto quedó auditado.',
        tone: 'success',
      });
    },
  });
  return (
    <MarketingLayout
      active="prospects"
      title="Estados y razones"
      description="Gestiona la conversación comercial, motivos de pérdida y cadencias sin hardcodear estados en la UI."
    >
      <Card>
        <CardHeader>
          <CardTitle>Actualizar estado del prospecto</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              change.mutate();
            }}
          >
            <Select
              aria-label="Contacto"
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
              required
            >
              <option value="">Selecciona un contacto</option>
              {(contacts.data?.data ?? []).map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contactLabel(contact)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Estado"
              value={state}
              onChange={(event) => setState(event.target.value)}
            >
              {[
                'NEW_UNANSWERED',
                'RESPONDED',
                'ACTIVE_CONVERSATION',
                'DEMO_REQUESTED',
                'DEMO_SENT',
                'FOLLOW_UP_SCHEDULED',
                'NO_RESPONSE_FOLLOW_UP_1',
                'NO_RESPONSE_FOLLOW_UP_2',
                'NO_RESPONSE_FOLLOW_UP_3',
                'FUTURE_REACTIVATION',
                'NOT_INTERESTED',
                'LOST',
                'PURCHASED',
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
            <Button disabled={change.isPending || !contactId} type="submit">
              Actualizar
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Razones configuradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(reasons.data ?? []).map((reason: MarketingLossReason) => (
              <div
                className="rounded-xl border border-border-default bg-surface-muted p-3"
                key={reason.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-content-primary">{reason.name}</p>
                  <Badge>{reason.type}</Badge>
                </div>
                <p className="mt-1 text-xs text-content-muted">{reason.systemKey}</p>
              </div>
            ))}
            {reasons.data?.length === 0 ? (
              <EmptyState
                title="Sin razones activas"
                description="Configura motivos para medir objeciones, silencio y pérdidas."
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Registrar una razón</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-content-secondary">
            Las razones se registran desde el flujo de contacto y oportunidad para mantener
            contexto, auditoría y tenant isolation.
          </p>
          <Select
            className="mt-3 max-w-md"
            aria-label="Razón"
            value={reasonId}
            onChange={(event) => setReasonId(event.target.value)}
          >
            <option value="">Selecciona razón de referencia</option>
            {(reasons.data ?? []).map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.name}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>
    </MarketingLayout>
  );
}

export function MarketingImportsPage(): React.ReactElement {
  const [type, setType] = useState('CONTACTS');
  const [csv, setCsv] = useState('firstName,lastName,email,phone,country\n');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const preview = useMutation({
    mutationFn: () =>
      api.previewCommercialImport({
        type,
        csv,
        idempotencyKey: idempotencyKey || `preview-${Date.now()}`,
      }),
  });
  const execute = useMutation({
    mutationFn: () => api.executeCommercialImport({ type, csv, idempotencyKey }),
    onSuccess: () => {
      setIdempotencyKey('');
    },
  });
  return (
    <MarketingLayout
      active="imports"
      title="Importaciones comerciales"
      description="Previsualiza y ejecuta cargas con idempotencia, validación de filas y reporte de resultados."
    >
      <Card>
        <CardHeader>
          <CardTitle>CSV comercial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              aria-label="Tipo de importación"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="CONTACTS">Contactos</option>
              <option value="ATTRIBUTION">Atribución</option>
              <option value="HISTORICAL_SALES">Ventas históricas</option>
              <option value="PAYMENTS">Pagos</option>
              <option value="SUBSCRIPTIONS">Suscripciones</option>
              <option value="DEMOS">Demos</option>
              <option value="OUTSTANDING_BALANCES">Saldos pendientes</option>
            </Select>
            <Input
              aria-label="Idempotency key"
              placeholder="Clave única de importación"
              value={idempotencyKey}
              onChange={(event) => setIdempotencyKey(event.target.value)}
            />
          </div>
          <Textarea
            aria-label="CSV"
            className="min-h-48 font-mono text-xs"
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={preview.isPending || csv.trim().length === 0}
              onClick={() => preview.mutate()}
            >
              Previsualizar
            </Button>
            <Button
              disabled={execute.isPending || !idempotencyKey || csv.trim().length === 0}
              onClick={() => execute.mutate()}
            >
              Ejecutar importación
            </Button>
          </div>
          {preview.data ? (
            <pre className="max-h-56 overflow-auto rounded-xl bg-surface-inset p-3 text-xs text-content-secondary">
              {JSON.stringify(preview.data, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
      <ImportsHistory />
    </MarketingLayout>
  );
}

function ImportsHistory(): React.ReactElement {
  const imports = useQuery({
    queryKey: ['commercial-imports'],
    queryFn: () => api.getCommercialImports(),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de importaciones</CardTitle>
      </CardHeader>
      <CardContent>
        {imports.data?.length ? (
          <div className="space-y-2">
            {imports.data.map((item) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-default p-3"
                key={item.id}
              >
                <div>
                  <p className="font-semibold text-content-primary">{item.type}</p>
                  <p className="text-xs text-content-muted">
                    {item.fileName ?? 'CSV manual'} · {item.rowCount} filas
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{item.status}</Badge>
                  <span className="text-xs text-content-secondary">
                    {item.succeededCount} ok · {item.failedCount} errores
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sin importaciones"
            description="Las cargas ejecutadas quedarán disponibles para auditoría."
          />
        )}
      </CardContent>
    </Card>
  );
}
