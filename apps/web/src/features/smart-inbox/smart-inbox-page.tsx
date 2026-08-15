'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select, Textarea } from '@/components/ui/input';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import { useUiStore } from '@/lib/ui-store';
import type {
  Person,
  PipelineResponse,
  ProductOffer,
  SmartInboxConversation,
  SmartInboxMessage,
  SmartInboxTimelineEvent,
  Tag,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const views = [
  ['INBOX', 'Inbox', 'inbox'],
  ['UNASSIGNED', 'Sin asignar', 'unassigned'],
  ['MINE', 'Mis conversaciones', 'mine'],
  ['PENDING', 'Pendientes', 'pending'],
  ['RENEWALS', 'Renovaciones', 'renewals'],
  ['CLOSED', 'Cerradas', 'closed'],
  ['ARCHIVED', 'Archivadas', 'archived'],
  ['TRASH', 'Papelera', 'trash'],
] as const;

type ViewCode = (typeof views)[number][0];
type QuickFilter = 'unread' | 'pending' | 'demo' | 'sale' | 'renewal';

function formatTime(value: string | null): string {
  if (!value) return 'Sin actividad';
  return new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value));
}

function personName(person: Person | null): string {
  return person ? `${person.firstName} ${person.lastName ?? ''}`.trim() : 'Sin responsable';
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function viewFromParam(value: string | null): ViewCode {
  return views.some(([code]) => code === value) ? (value as ViewCode) : 'INBOX';
}

function Timeline({ events }: { readonly events: SmartInboxTimelineEvent[] }): React.ReactElement {
  if (events.length === 0)
    return (
      <EmptyState
        className="min-h-32"
        description="Los mensajes, ventas y operaciones aparecerán aquí."
        title="Timeline vacío"
      />
    );
  return (
    <div className="space-y-3" data-testid="smart-inbox-timeline">
      {events.map((event) => (
        <div className="flex gap-3" key={event.id}>
          <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-500/10" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-content-primary">{event.title}</p>
              <time className="text-[10px] text-content-muted">{formatTime(event.occurredAt)}</time>
            </div>
            {event.description ? (
              <p className="mt-1 break-words text-xs leading-5 text-content-secondary">
                {event.description}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ message }: { readonly message: SmartInboxMessage }): React.ReactElement {
  const outbound = message.direction === 'OUTBOUND';
  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[74%]',
          outbound
            ? 'rounded-br-md bg-brand-600 text-white'
            : 'rounded-bl-md border border-border-default bg-surface-card text-content-primary',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.text ?? `[${message.type}]`}</p>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
          <span>{formatTime(message.createdAt)}</span>
          {outbound ? <span>· {message.status}</span> : null}
        </div>
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  readonly conversation: SmartInboxConversation;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): React.ReactElement {
  return (
    <button
      aria-label={`Abrir conversación con ${conversation.name}`}
      className={cn(
        'w-full border-b border-border-subtle px-3 py-3 text-left transition hover:bg-surface-muted sm:px-4',
        selected && 'bg-brand-50/80 dark:bg-brand-500/10',
      )}
      data-testid="smart-inbox-conversation"
      onClick={onSelect}
      type="button"
    >
      <div className="flex min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
          {conversation.avatar || initials(conversation.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-bold text-content-primary">{conversation.name}</p>
            <time className="shrink-0 text-[10px] text-content-muted">
              {formatTime(conversation.lastMessageAt)}
            </time>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-content-secondary">
            {conversation.flag} {conversation.phone}
          </p>
          <p className="mt-1 truncate text-xs text-content-secondary">
            {conversation.lastMessage ?? 'Sin mensajes'}
          </p>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            {conversation.pipeline ? (
              <Badge className="bg-surface-muted text-content-secondary">
                {conversation.pipeline.name}
              </Badge>
            ) : null}
            <Badge className="bg-surface-muted text-content-muted">{conversation.channel}</Badge>
            {!conversation.window.open ? (
              <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                Ventana cerrada
              </Badge>
            ) : null}
            {conversation.isVip ? (
              <Badge className="bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                VIP
              </Badge>
            ) : null}
            {conversation.renewalDue ? (
              <Badge className="bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                Renovación
              </Badge>
            ) : null}
            {conversation.unreadCount > 0 ? (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                {conversation.unreadCount}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function PanelSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="border-t border-border-subtle px-4 py-4 first:border-t-0">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-content-muted">
        {title}
      </p>
      {children}
    </section>
  );
}

export function SmartInboxPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const [view, setView] = useState<ViewCode>(viewFromParam(searchParams.get('view')));
  const [search, setSearch] = useState('');
  const [quickFilters, setQuickFilters] = useState<Partial<Record<QuickFilter, boolean>>>({});
  const [countryFilter, setCountryFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [saleProductId, setSaleProductId] = useState('');
  const [saleQuantity, setSaleQuantity] = useState('1');
  const [fulfillmentItemId, setFulfillmentItemId] = useState('');
  const filters = queryString({
    view,
    search,
    limit: 40,
    unread: quickFilters.unread || undefined,
    pending: quickFilters.pending || undefined,
    demo: quickFilters.demo || undefined,
    sale: quickFilters.sale || undefined,
    renewal: quickFilters.renewal || undefined,
    country: countryFilter || undefined,
    assignedUserId: assigneeFilter || undefined,
    productId: productFilter || undefined,
    tagId: tagFilter || undefined,
    source: sourceFilter || undefined,
    campaignId: campaignFilter || undefined,
  });
  const conversations = useQuery({
    queryKey: ['smart-inbox', 'conversations', filters],
    queryFn: () => api.getSmartInboxConversations(filters),
    refetchInterval: 15_000,
  });
  const detail = useQuery({
    queryKey: ['smart-inbox', 'conversation', selectedId],
    queryFn: () => api.getSmartInboxConversation(selectedId ?? ''),
    enabled: Boolean(selectedId),
    refetchInterval: 15_000,
  });
  const pipeline = useQuery<PipelineResponse>({
    queryKey: ['smart-inbox', 'pipeline'],
    queryFn: () => api.getPipeline('?limit=100'),
  });
  const assignees = useQuery<Person[]>({
    queryKey: ['smart-inbox', 'assignees'],
    queryFn: () => api.getContactAssignees(),
  });
  const offers = useQuery<{ data: ProductOffer[] }>({
    queryKey: ['smart-inbox', 'offers'],
    queryFn: () => api.getOffers('?customerSegment=ANY&currency=USD&limit=50'),
  });
  const tags = useQuery<Tag[]>({
    queryKey: ['smart-inbox', 'tags'],
    queryFn: () => api.getTags(),
  });

  useEffect(() => {
    if (!selectedId && conversations.data?.data[0]) setSelectedId(conversations.data.data[0].id);
  }, [conversations.data, selectedId]);

  useEffect(() => {
    const unsubscribe = api.subscribeSmartInboxEvents(() => {
      void queryClient.invalidateQueries({ queryKey: ['smart-inbox'] });
    });
    return unsubscribe;
  }, [queryClient]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') setSelectedId((current) => current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCommandOpen]);

  const selected = detail.data?.conversation ?? null;
  const panel = detail.data?.panel;
  const activeOpportunity = panel?.opportunities[0] ?? null;
  const pipelineStages = pipeline.data?.stages ?? [];
  const products = offers.data?.data ?? [];

  const refreshSelected = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['smart-inbox'] });
  };

  const move = useMutation({
    mutationFn: (pipelineStageId: string) =>
      api.moveSmartInboxPipeline(selectedId ?? '', {
        pipelineStageId,
        reason: 'Workspace operativo',
      }),
    onSuccess: () => {
      refreshSelected();
      toast({ title: 'Pipeline actualizado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible mover la oportunidad',
        description: error.message,
        tone: 'error',
      }),
  });
  const addNote = useMutation({
    mutationFn: () => api.addSmartInboxNote(selectedId ?? '', note.trim()),
    onSuccess: () => {
      setNote('');
      refreshSelected();
      toast({ title: 'Nota agregada', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible agregar la nota', description: error.message, tone: 'error' }),
  });
  const createSale = useMutation({
    mutationFn: () =>
      api.createSmartInboxSale(selectedId ?? '', {
        currency: 'USD',
        items: [{ productId: saleProductId, quantity: saleQuantity }],
      }),
    onSuccess: () => {
      refreshSelected();
      toast({
        title: 'Venta creada',
        description: 'La venta quedó disponible en el panel operacional.',
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible crear la venta', description: error.message, tone: 'error' }),
  });
  const schedule = useMutation({
    mutationFn: () =>
      api.scheduleSmartInboxFollowUp(selectedId ?? '', {
        title: 'Seguimiento desde Inbox',
        dueAt: new Date(followUpAt).toISOString(),
        priority: 'NORMAL',
      }),
    onSuccess: () => {
      setFollowUpAt('');
      refreshSelected();
      toast({ title: 'Seguimiento programado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible programar', description: error.message, tone: 'error' }),
  });
  const createFulfillment = useMutation({
    mutationFn: () =>
      api.createSmartInboxFulfillment(selectedId ?? '', {
        saleItemId: fulfillmentItemId,
        mode: 'MANUAL',
      }),
    onSuccess: () => {
      refreshSelected();
      toast({ title: 'Fulfillment creado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible crear fulfillment',
        description: error.message,
        tone: 'error',
      }),
  });

  const changeView = (nextView: ViewCode): void => {
    setView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.set('view', nextView);
    window.history.replaceState(null, '', url.toString());
  };

  const messageList = detail.data?.messages ?? [];
  const timeline = detail.data?.timeline ?? [];
  const detailLoading = Boolean(selectedId) && detail.isLoading;

  return (
    <QueryState
      isError={conversations.isError}
      isLoading={conversations.isLoading}
      onRetry={() => void conversations.refetch()}
    >
      <div className="space-y-4" data-testid="smart-inbox-page">
        <PageHeader
          eyebrow="Operational workspace"
          title="WhatsApp Inbox"
          description="Observa conversaciones entrantes y coordina manualmente la operación comercial."
          actions={
            <>
              <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                Tiempo real preparado
              </Badge>
              <Button onClick={() => refreshSelected()} size="sm" variant="outline">
                ↻ Actualizar
              </Button>
            </>
          }
        />

        <div
          className="grid min-h-[620px] min-w-0 overflow-hidden rounded-2xl border border-border-default bg-surface-card shadow-card lg:h-[calc(100dvh-190px)] lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_320px]"
          data-testid="smart-inbox-workspace"
        >
          <aside className="flex min-h-0 min-w-0 flex-col border-b border-border-default lg:border-b-0 lg:border-r">
            <div className="border-b border-border-subtle p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-content-primary">Conversaciones</h2>
                  <p className="mt-1 text-xs text-content-muted">
                    {conversations.data?.pagination.total ?? 0} en esta vista
                  </p>
                </div>
                <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                  WhatsApp
                </Badge>
              </div>
              <Input
                aria-label="Buscar conversaciones"
                className="mt-3"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nombre, teléfono o mensaje..."
                value={search}
              />
              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
                {views.map(([code, label, countKey]) => (
                  <button
                    className={cn(
                      'flex min-w-0 items-center justify-between rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition',
                      view === code
                        ? 'bg-brand-600 text-white'
                        : 'text-content-secondary hover:bg-surface-muted',
                    )}
                    key={code}
                    onClick={() => changeView(code)}
                    type="button"
                  >
                    <span className="truncate">{label}</span>
                    <span
                      className={cn(
                        'ml-1 text-[10px]',
                        view === code ? 'text-white/80' : 'text-content-muted',
                      )}
                    >
                      {conversations.data?.views[countKey] ?? 0}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(['unread', 'pending', 'demo', 'sale', 'renewal'] as const).map((filter) => {
                  const active = Boolean(quickFilters[filter]);
                  return (
                    <button
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[10px] font-semibold transition',
                        active
                          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                          : 'border-border-default text-content-secondary hover:border-brand-400 hover:text-brand-600',
                      )}
                      key={filter}
                      onClick={() =>
                        setQuickFilters((current) => ({ ...current, [filter]: !active }))
                      }
                      type="button"
                    >
                      {filter === 'unread'
                        ? 'No leídos'
                        : filter === 'demo'
                          ? 'Demo'
                          : filter === 'sale'
                            ? 'Venta'
                            : filter === 'renewal'
                              ? 'Renovación'
                              : 'Pendientes'}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Select
                  aria-label="Filtrar por país"
                  onChange={(event) => setCountryFilter(event.target.value)}
                  value={countryFilter}
                >
                  <option value="">Todos los países</option>
                  {['CL', 'MX', 'PE', 'BO', 'EC', 'US'].map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Filtrar por responsable"
                  onChange={(event) => setAssigneeFilter(event.target.value)}
                  value={assigneeFilter}
                >
                  <option value="">Todos los responsables</option>
                  {assignees.data?.map((person) => (
                    <option key={person.id} value={person.id}>
                      {personName(person)}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Filtrar por producto"
                  onChange={(event) => setProductFilter(event.target.value)}
                  value={productFilter}
                >
                  <option value="">Todos los productos</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Filtrar por etiqueta"
                  onChange={(event) => setTagFilter(event.target.value)}
                  value={tagFilter}
                >
                  <option value="">Todas las etiquetas</option>
                  {tags.data?.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label="Filtrar por fuente"
                  className="col-span-2"
                  onChange={(event) => setSourceFilter(event.target.value)}
                  placeholder="Fuente: Meta Ads, referido..."
                  value={sourceFilter}
                />
                <Input
                  aria-label="Filtrar por campaña"
                  className="col-span-2"
                  onChange={(event) => setCampaignFilter(event.target.value)}
                  placeholder="Campaña por ID..."
                  value={campaignFilter}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {conversations.data?.data.length ? (
                conversations.data.data.map((conversation) => (
                  <ConversationRow
                    conversation={conversation}
                    key={conversation.id}
                    onSelect={() => {
                      setSelectedId(conversation.id);
                    }}
                    selected={selectedId === conversation.id}
                  />
                ))
              ) : (
                <EmptyState
                  className="m-3 min-h-48"
                  description="Prueba otro filtro o término de búsqueda."
                  title="No hay conversaciones"
                />
              )}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col border-b border-border-default lg:border-b-0 lg:border-r">
            {selected && !detailLoading ? (
              <>
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                      {selected.avatar}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-bold text-content-primary">
                        {selected.name}
                      </h2>
                      <p className="truncate text-xs text-content-secondary">
                        {selected.flag} {selected.phone} · {selected.channel}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selected.status} />
                    <Button
                      aria-label="Cerrar panel de conversación"
                      onClick={() => setSelectedId(null)}
                      size="sm"
                      variant="ghost"
                    >
                      ×
                    </Button>
                  </div>
                </header>
                <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-inset px-4 py-2.5 text-[11px] sm:px-5">
                  <span
                    className={
                      selected.window.open
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }
                  >
                    {selected.window.open ? '● Ventana 24h abierta' : '● Ventana 24h cerrada'}
                  </span>
                  <span className="text-content-muted">
                    Expira: {formatDate(selected.window.expiresAt)}
                  </span>
                </div>
                <div
                  className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-inset px-3 py-4 sm:px-5"
                  data-testid="smart-inbox-thread"
                >
                  {messageList.length ? (
                    messageList.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))
                  ) : (
                    <EmptyState
                      className="min-h-48"
                      description="Este canal todavía no tiene mensajes."
                      title="Conversación nueva"
                    />
                  )}
                </div>
                <div className="border-t border-border-subtle bg-surface-inset p-3 text-center text-xs text-content-muted sm:p-4">
                  WhatsApp Read Only: el operador continúa la conversación en WhatsApp Business.
                </div>
              </>
            ) : (
              <EmptyState
                className="m-4 flex-1"
                description="Selecciona una conversación para activar el workspace operativo."
                title="Selecciona una conversación"
              />
            )}
          </section>

          <aside
            className="min-h-0 min-w-0 overflow-y-auto bg-surface-card"
            data-testid="smart-inbox-operational-panel"
          >
            {selected && panel ? (
              <>
                <div className="border-b border-border-subtle px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-content-primary text-sm font-bold text-surface-page">
                      {selected.avatar}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-bold text-content-primary">
                        {selected.name}
                      </h2>
                      <p className="truncate text-xs text-content-secondary">
                        {panel.contact.email ?? panel.contact.phone ?? 'Sin datos de contacto'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selected.chips.slice(0, 4).map((chip) => (
                          <Badge className="bg-surface-muted text-content-secondary" key={chip}>
                            {chip}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <PanelSection title="Client snapshot">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      [
                        '1ª respuesta',
                        panel.metrics.firstResponseSeconds
                          ? `${Math.round(panel.metrics.firstResponseSeconds / 60)}m`
                          : '—',
                      ],
                      ['Mensajes', String(panel.metrics.messageCount)],
                      ['Ventas', String(panel.metrics.saleCount)],
                      ['Ingresos', `${panel.sales[0]?.currency ?? 'USD'} ${panel.metrics.revenue}`],
                      ['MRR', panel.metrics.mrr],
                      ['LTV', panel.metrics.ltv],
                    ].map(([label, value]) => (
                      <div className="rounded-xl bg-surface-inset p-2.5" key={label}>
                        <p className="text-[10px] text-content-muted">{label}</p>
                        <p className="mt-1 text-sm font-bold text-content-primary">{value}</p>
                      </div>
                    ))}
                  </div>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-content-muted">País</dt>
                      <dd className="font-semibold text-content-primary">
                        {selected.flag} {panel.contact.country ?? '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-content-muted">Origen</dt>
                      <dd className="font-semibold text-content-primary">
                        {panel.contact.source ?? '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-content-muted">Próxima renovación</dt>
                      <dd className="font-semibold text-content-primary">
                        {formatDate(panel.metrics.nextRenewalAt)}
                      </dd>
                    </div>
                  </dl>
                </PanelSection>
                <PanelSection title="Action center">
                  <div className="space-y-2">
                    <div className="rounded-xl bg-surface-inset p-3 text-xs text-content-secondary">
                      Responsable:{' '}
                      {selected.assignedTo ? personName(selected.assignedTo) : 'Sin responsable'}
                    </div>
                    {activeOpportunity ? (
                      <label className="block text-xs font-semibold text-content-secondary">
                        Pipeline
                        <Select
                          aria-label="Pipeline"
                          className="mt-1"
                          onChange={(event) =>
                            event.target.value && move.mutate(event.target.value)
                          }
                          value={activeOpportunity.pipelineStage.id}
                        >
                          {pipelineStages.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                              {stage.name}
                            </option>
                          ))}
                        </Select>
                      </label>
                    ) : (
                      <p className="rounded-xl bg-surface-inset p-3 text-xs text-content-secondary">
                        Sin oportunidad activa para mover.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        disabled={!note.trim() || addNote.isPending}
                        onClick={() => addNote.mutate()}
                        size="sm"
                        variant="outline"
                      >
                        Agregar nota
                      </Button>
                      <Button
                        disabled={!followUpAt || schedule.isPending}
                        onClick={() => schedule.mutate()}
                        size="sm"
                        variant="outline"
                      >
                        Programar
                      </Button>
                    </div>
                    <Textarea
                      aria-label="Nota"
                      className="min-h-16"
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Nota interna..."
                      value={note}
                    />
                    <Input
                      aria-label="Fecha de seguimiento"
                      onChange={(event) => setFollowUpAt(event.target.value)}
                      type="datetime-local"
                      value={followUpAt}
                    />
                  </div>
                </PanelSection>
                <PanelSection title="Productos y venta">
                  <div className="space-y-2">
                    <Select
                      aria-label="Producto para venta"
                      onChange={(event) => setSaleProductId(event.target.value)}
                      value={saleProductId}
                    >
                      <option value="">Selecciona un producto...</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        aria-label="Cantidad"
                        min="1"
                        onChange={(event) => setSaleQuantity(event.target.value)}
                        type="number"
                        value={saleQuantity}
                      />
                      <Button
                        disabled={!saleProductId || createSale.isPending}
                        onClick={() => createSale.mutate()}
                        size="sm"
                      >
                        Crear venta
                      </Button>
                    </div>
                  </div>
                  {panel.sales.length ? (
                    <div className="mt-3 space-y-2">
                      {panel.sales.slice(0, 3).map((sale) => (
                        <div className="rounded-xl border border-border-subtle p-2.5" key={sale.id}>
                          <div className="flex justify-between gap-2 text-xs">
                            <span className="font-semibold text-content-primary">
                              {sale.items[0]?.productNameSnapshot ?? 'Venta'}
                            </span>
                            <StatusBadge status={sale.status} />
                          </div>
                          <p className="mt-1 text-xs text-content-secondary">
                            {sale.currency} {sale.total} · {formatDate(sale.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </PanelSection>
                <PanelSection title="Fulfillment">
                  <Select
                    aria-label="Ítem para fulfillment"
                    onChange={(event) => setFulfillmentItemId(event.target.value)}
                    value={fulfillmentItemId}
                  >
                    <option value="">Selecciona ítem de venta...</option>
                    {panel.sales
                      .flatMap((sale) => sale.items)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.productNameSnapshot}
                        </option>
                      ))}
                  </Select>
                  <Button
                    className="mt-2 w-full"
                    disabled={!fulfillmentItemId || createFulfillment.isPending}
                    onClick={() => createFulfillment.mutate()}
                    size="sm"
                    variant="outline"
                  >
                    Crear fulfillment manual
                  </Button>
                </PanelSection>
                <PanelSection title="Timeline unificada">
                  <Timeline events={timeline} />
                </PanelSection>
                <PanelSection title="Estado">
                  <p className="text-xs text-content-muted">
                    El estado se actualiza únicamente desde los eventos entrantes del canal.
                  </p>
                </PanelSection>
              </>
            ) : (
              <div className="p-4">
                <EmptyState
                  className="min-h-48"
                  description="El panel operacional se activa al seleccionar un chat."
                  title="Panel operativo"
                />
              </div>
            )}
          </aside>
        </div>
      </div>
    </QueryState>
  );
}
