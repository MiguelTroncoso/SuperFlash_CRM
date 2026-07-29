'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PermissionGate } from '@/components/ui/permission-gate';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { WhatsAppConnection, WhatsAppConversation, WhatsAppMessage } from '@/lib/types';

interface ConnectionForm {
  wabaId: string;
  phoneNumberId: string;
  businessPhoneNumber: string;
  graphApiVersion: string;
  accessToken: string;
  appSecret: string;
  webhookVerifyToken: string;
}

interface MessageForm {
  type: 'TEXT' | 'TEMPLATE';
  text: string;
  templateName: string;
  templateLanguage: string;
}

function ConnectionSettings({
  connection,
}: {
  readonly connection: WhatsAppConnection | null;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const form = useForm<ConnectionForm>({
    defaultValues: {
      wabaId: '',
      phoneNumberId: '',
      businessPhoneNumber: '',
      graphApiVersion: 'v23.0',
      accessToken: '',
      appSecret: '',
      webhookVerifyToken: '',
    },
  });
  useEffect(() => {
    if (!connection) return;
    form.reset({
      wabaId: connection.wabaId,
      phoneNumberId: connection.phoneNumberId,
      businessPhoneNumber: connection.businessPhoneNumber,
      graphApiVersion: connection.graphApiVersion,
      accessToken: '',
      appSecret: '',
      webhookVerifyToken: '',
    });
  }, [connection, form]);
  const save = useMutation({
    mutationFn: (values: ConnectionForm) => api.saveWhatsAppConnection({ ...values }),
    onSuccess: () => {
      form.reset({ ...form.getValues(), accessToken: '', appSecret: '', webhookVerifyToken: '' });
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-connection'] });
      toast({
        title: 'Conexión guardada',
        description: 'Los secretos se conservaron cifrados en el backend.',
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible guardar', description: error.message, tone: 'error' }),
  });
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Configuración Cloud API</CardTitle>
          <CardDescription>
            Los campos secretos se escriben una vez y nunca se vuelven a mostrar.
          </CardDescription>
        </div>
        <StatusBadge status={connection?.status ?? 'DISCONNECTED'} />
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <label className="space-y-1 text-sm font-semibold">
            WABA ID
            <Input {...form.register('wabaId', { required: true })} placeholder="123456789" />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            Phone Number ID
            <Input
              {...form.register('phoneNumberId', { required: true })}
              placeholder="987654321"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            Número comercial
            <Input
              {...form.register('businessPhoneNumber', { required: true })}
              placeholder="+569..."
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            Graph API version
            <Input {...form.register('graphApiVersion', { required: true })} />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            Access Token
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register('accessToken')}
              placeholder={
                connection ? 'Conservado; deja vacío para mantenerlo' : 'Token permanente de Meta'
              }
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            App Secret
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register('appSecret')}
              placeholder={connection ? 'Conservado; deja vacío para mantenerlo' : 'App Secret'}
            />
          </label>
          <label className="space-y-1 text-sm font-semibold md:col-span-2">
            Webhook Verify Token
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register('webhookVerifyToken')}
              placeholder={
                connection
                  ? 'Conservado; deja vacío para mantenerlo'
                  : 'Token que configurarás en Meta'
              }
            />
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <PermissionGate permission="whatsapp.manage">
              <Button disabled={save.isPending} type="submit">
                {save.isPending ? 'Guardando…' : 'Guardar conexión'}
              </Button>
            </PermissionGate>
          </div>
        </form>
        {connection ? (
          <p className="mt-4 text-xs text-slate-500">
            Webhook público:{' '}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
              /api/v1/integrations/whatsapp/webhook
            </code>
            . Último webhook:{' '}
            {connection.lastWebhookReceivedAt
              ? new Date(connection.lastWebhookReceivedAt).toLocaleString()
              : 'sin eventos'}
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  readonly conversations: WhatsAppConversation[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}): React.ReactElement {
  if (conversations.length === 0)
    return (
      <EmptyState
        title="Sin conversaciones"
        description="Los mensajes entrantes de WhatsApp aparecerán aquí."
      />
    );
  return (
    <div className="space-y-2">
      {conversations.map((conversation) => (
        <button
          className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === conversation.id ? 'border-brand-400 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/10' : 'border-slate-200 bg-white hover:border-brand-200 dark:border-slate-800 dark:bg-slate-900'}`}
          key={conversation.id}
          onClick={() => onSelect(conversation.id)}
          type="button"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-slate-900 dark:text-white">
                {conversation.contact?.name ||
                  conversation.externalContactName ||
                  conversation.externalContactPhone}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {conversation.externalContactPhoneNormalized}
              </p>
            </div>
            {conversation.unreadCount > 0 ? (
              <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">
                {conversation.unreadCount}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <StatusBadge status={conversation.status} />
            <span>
              {conversation.lastMessageAt
                ? new Date(conversation.lastMessageAt).toLocaleString()
                : 'Sin mensajes'}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function MessageThread({
  conversation,
  messages,
  templates,
}: {
  readonly conversation: WhatsAppConversation;
  readonly messages: WhatsAppMessage[];
  readonly templates: { id: string; name: string; language: string | null; status: string }[];
}): React.ReactElement {
  const toast = useToastStore((state) => state.push);
  const form = useForm<MessageForm>({
    defaultValues: { type: 'TEXT', text: '', templateName: '', templateLanguage: 'es' },
  });
  const send = useMutation({
    mutationFn: (values: MessageForm) =>
      api.sendWhatsAppMessage(
        conversation.id,
        values.type === 'TEXT'
          ? { type: values.type, text: values.text }
          : {
              type: values.type,
              templateName: values.templateName,
              templateLanguage: values.templateLanguage,
            },
      ),
    onSuccess: () => {
      form.reset({ ...form.getValues(), text: '' });
      toast({
        title: 'Mensaje encolado',
        description: 'El procesador enviará el mensaje y actualizará su estado desde el webhook.',
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({
        title: 'No fue posible encolar el mensaje',
        description: error.message,
        tone: 'error',
      }),
  });
  const type = form.watch('type');
  return (
    <Card className="flex min-h-[620px] flex-col">
      <CardHeader>
        <div>
          <CardTitle>{conversation.contact?.name || conversation.externalContactPhone}</CardTitle>
          <CardDescription>
            {conversation.externalContactPhoneNormalized} · ventana{' '}
            {conversation.windowExpiresAt && new Date(conversation.windowExpiresAt) > new Date()
              ? 'abierta'
              : 'expirada'}
          </CardDescription>
        </div>
        <StatusBadge status={conversation.status} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
          {messages.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Aún no hay mensajes.</p>
          ) : (
            messages.map((message) => (
              <div
                className={`flex ${message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
                key={message.id}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.direction === 'OUTBOUND' ? 'bg-brand-600 text-white' : 'bg-white text-slate-800 shadow-sm dark:bg-slate-900 dark:text-slate-100'}`}
                >
                  <p>{message.text || `[${message.type}]`}</p>
                  <p
                    className={`mt-2 text-[10px] ${message.direction === 'OUTBOUND' ? 'text-brand-100' : 'text-slate-400'}`}
                  >
                    {message.status} · {new Date(message.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        <PermissionGate
          permission="whatsapp.send"
          fallback={
            <p className="text-sm text-slate-500">No tienes permiso para enviar mensajes.</p>
          }
        >
          <form className="space-y-3" onSubmit={form.handleSubmit((values) => send.mutate(values))}>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <Select {...form.register('type')}>
                <option value="TEXT">Texto</option>
                <option value="TEMPLATE">Plantilla aprobada</option>
              </Select>
              {type === 'TEXT' ? (
                <Textarea
                  {...form.register('text', { required: true })}
                  placeholder="Escribe una respuesta…"
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select {...form.register('templateName', { required: true })}>
                    <option value="">Selecciona una plantilla</option>
                    {templates
                      .filter((template) => template.status === 'APPROVED')
                      .map((template) => (
                        <option key={`${template.name}-${template.language}`} value={template.name}>
                          {template.name} · {template.language}
                        </option>
                      ))}
                  </Select>
                  <Input
                    {...form.register('templateLanguage', { required: true })}
                    placeholder="es"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button disabled={send.isPending} type="submit">
                {send.isPending ? 'Enviando…' : 'Enviar'}
              </Button>
            </div>
          </form>
        </PermissionGate>
      </CardContent>
    </Card>
  );
}

export function WhatsAppPage({
  settingsOnly = false,
}: { readonly settingsOnly?: boolean } = {}): React.ReactElement {
  const [tab, setTab] = useState<'inbox' | 'settings'>('inbox');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const connection = useQuery({
    queryKey: ['whatsapp-connection'],
    queryFn: api.getWhatsAppConnection,
  });
  const conversations = useQuery({
    queryKey: ['whatsapp-conversations'],
    queryFn: () => api.getWhatsAppConversations(queryString({ limit: 50 })),
    enabled: !settingsOnly,
  });
  const selected =
    conversations.data?.data.find((item) => item.id === selectedId) ??
    conversations.data?.data[0] ??
    null;
  useEffect(() => {
    setSelectedId(new URLSearchParams(window.location.search).get('conversation'));
  }, []);
  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selected, selectedId]);
  const messages = useQuery({
    queryKey: ['whatsapp-messages', selected?.id],
    queryFn: () => api.getWhatsAppMessages(selected?.id ?? ''),
    enabled: Boolean(selected) && !settingsOnly,
    refetchInterval: selected ? 5000 : false,
  });
  const templates = useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: api.getWhatsAppTemplates,
    enabled: Boolean(connection.data) && !settingsOnly,
  });
  const test = useMutation({
    mutationFn: api.testWhatsAppConnection,
    onSuccess: () => void connection.refetch(),
  });
  const sync = useMutation({
    mutationFn: api.syncWhatsAppTemplates,
    onSuccess: () => void templates.refetch(),
  });
  const isLoading = connection.isLoading || (!settingsOnly && conversations.isLoading);
  const isError = connection.isError || (!settingsOnly && conversations.isError);
  return (
    <QueryState
      isError={isError}
      isLoading={isLoading}
      onRetry={() => {
        void connection.refetch();
        void conversations.refetch();
      }}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Integrations"
          title="WhatsApp"
          description="Bandeja interna y configuración de WhatsApp Business Cloud API, con secretos protegidos en el backend."
          actions={
            <div className="flex gap-2">
              <Button
                onClick={() => setTab('inbox')}
                variant={tab === 'inbox' ? 'primary' : 'outline'}
              >
                Bandeja
              </Button>
              <Button
                onClick={() => setTab('settings')}
                variant={tab === 'settings' ? 'primary' : 'outline'}
              >
                Configuración
              </Button>
            </div>
          }
        />
        {settingsOnly || tab === 'settings' ? (
          <>
            <ConnectionSettings connection={connection.data ?? null} />
            <div className="flex gap-2">
              <PermissionGate permission="whatsapp.manage">
                <Button
                  disabled={test.isPending || !connection.data}
                  onClick={() => test.mutate()}
                  variant="outline"
                >
                  {test.isPending ? 'Validando…' : 'Probar conexión'}
                </Button>
              </PermissionGate>
              <PermissionGate permission="whatsapp.templates.read">
                <Button
                  disabled={sync.isPending || !connection.data}
                  onClick={() => sync.mutate()}
                  variant="outline"
                >
                  {sync.isPending ? 'Sincronizando…' : 'Sincronizar plantillas'}
                </Button>
              </PermissionGate>
            </div>
          </>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Conversaciones</CardTitle>
                  <CardDescription>
                    {conversations.data?.pagination.total ?? 0} conversaciones
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <ConversationList
                  conversations={conversations.data?.data ?? []}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                />
              </CardContent>
            </Card>
            {selected ? (
              <MessageThread
                conversation={selected}
                messages={messages.data?.data ?? []}
                templates={templates.data?.data ?? []}
              />
            ) : (
              <EmptyState
                title="Selecciona una conversación"
                description="Elige un contacto para revisar el hilo y responder."
              />
            )}
          </div>
        )}
      </PageGrid>
    </QueryState>
  );
}
