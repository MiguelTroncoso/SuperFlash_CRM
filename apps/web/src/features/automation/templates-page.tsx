'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PermissionGate } from '@/components/ui/permission-gate';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { JsonRecord, MessageTemplate } from '@/lib/types';

const schema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usa minúsculas y guiones.'),
  channel: z.enum(['INTERNAL', 'EMAIL', 'WHATSAPP', 'SMS', 'PUSH', 'WEBHOOK']),
  subject: z.string().max(240).optional(),
  body: z.string().min(1).max(20_000),
});

type FormValues = z.infer<typeof schema>;

export function TemplatesPage(): React.ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [preview, setPreview] = useState<JsonRecord | null>(null);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '', channel: 'INTERNAL', subject: '', body: '' },
  });
  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.getTemplates(queryString({ page: 1, limit: 100 })),
  });
  useEffect(() => {
    form.reset({
      name: selected?.name ?? '',
      slug: selected?.slug ?? '',
      channel: (selected?.channel as FormValues['channel']) ?? 'INTERNAL',
      subject: selected?.subject ?? '',
      body: selected?.body ?? '',
    });
    setPreview(null);
  }, [form, selected]);
  const save = useMutation({
    mutationFn: (values: FormValues) =>
      selected ? api.updateTemplate(selected.id, values) : api.createTemplate(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      setDrawerOpen(false);
      setSelected(null);
      toast({ title: selected ? 'Plantilla actualizada' : 'Plantilla creada', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible guardar', description: error.message, tone: 'error' }),
  });
  const renderPreview = useMutation({
    mutationFn: (values: FormValues) =>
      api.previewTemplate({
        ...(selected
          ? { templateId: selected.id }
          : { subject: values.subject, body: values.body }),
        context: {
          contact: { name: 'Juan Pérez', email: 'juan@example.com' },
          sale: { total: '199.00', currency: 'USD' },
          subscription: { nextBilling: '2026-08-30T12:00:00.000Z' },
          trial: { endsAt: '2026-08-25T12:00:00.000Z' },
        },
      }),
    onSuccess: (result) => setPreview(result),
    onError: (error: Error) =>
      toast({ title: 'No fue posible renderizar', description: error.message, tone: 'error' }),
  });
  const records = templates.data?.data ?? [];
  return (
    <QueryState
      isError={templates.isError}
      isLoading={templates.isLoading}
      onRetry={() => void templates.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Communications engine"
          title="Plantillas"
          description="Versiona mensajes internos con variables seguras y vista previa antes de activarlos."
          actions={
            <PermissionGate permission="templates.create">
              <Button
                onClick={() => {
                  setSelected(null);
                  setDrawerOpen(true);
                }}
              >
                ＋ Nueva plantilla
              </Button>
            </PermissionGate>
          }
        />
        {records.length === 0 ? (
          <EmptyState
            title="No hay plantillas"
            description="Crea una plantilla para reutilizar mensajes en tus automatizaciones."
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {records.map((template: MessageTemplate) => (
              <Card
                className="cursor-pointer transition hover:-translate-y-0.5 hover:border-brand-300"
                key={template.id}
                onClick={() => {
                  setSelected(template);
                  setDrawerOpen(true);
                }}
              >
                <CardHeader>
                  <div>
                    <CardTitle>{template.name}</CardTitle>
                    <CardDescription>{template.slug}</CardDescription>
                  </div>
                  <StatusBadge status={template.status} />
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {template.body}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                    <span>{template.channel}</span>
                    <span>
                      v{template.version} · {template.variables.length} variables
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Drawer
          description="Las variables usan la sintaxis {{contact.name}} y se validan al renderizar."
          onClose={() => {
            setDrawerOpen(false);
            setSelected(null);
          }}
          open={drawerOpen}
          title={selected ? 'Editar plantilla' : 'Nueva plantilla'}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => void form.handleSubmit((values) => save.mutate(values))(event)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Nombre
                <Input className="mt-2" {...form.register('name')} />
              </label>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Slug
                <Input className="mt-2" {...form.register('slug')} />
              </label>
            </div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Canal
              <Select className="mt-2" {...form.register('channel')}>
                <option value="INTERNAL">Interno</option>
                <option value="EMAIL">Email (futuro)</option>
                <option value="WHATSAPP">WhatsApp (futuro)</option>
                <option value="SMS">SMS (futuro)</option>
                <option value="PUSH">Push (futuro)</option>
                <option value="WEBHOOK">Webhook (futuro)</option>
              </Select>
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Asunto
              <Input className="mt-2" {...form.register('subject')} />
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Contenido
              <Textarea
                className="mt-2 min-h-44"
                {...form.register('body')}
                placeholder="Hola {{contact.name}}..."
              />
            </label>
            {form.formState.errors.body ? (
              <p className="text-xs text-rose-600">{form.formState.errors.body.message}</p>
            ) : null}
            {preview ? (
              <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm dark:border-brand-500/20 dark:bg-brand-500/10">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                  Vista previa
                </p>
                <p className="mt-3 font-semibold text-slate-900 dark:text-white">
                  {typeof preview.subject === 'string' ? preview.subject : 'Sin asunto'}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                  {typeof preview.body === 'string' ? preview.body : ''}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button
                disabled={renderPreview.isPending}
                onClick={() => void form.handleSubmit((values) => renderPreview.mutate(values))()}
                type="button"
                variant="outline"
              >
                {renderPreview.isPending ? 'Renderizando…' : 'Vista previa'}
              </Button>
              <Button
                onClick={() => {
                  setDrawerOpen(false);
                  setSelected(null);
                }}
                type="button"
                variant="ghost"
              >
                Cancelar
              </Button>
              <PermissionGate permission={selected ? 'templates.update' : 'templates.create'}>
                <Button disabled={save.isPending} type="submit">
                  {save.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </PermissionGate>
            </div>
          </form>
        </Drawer>
      </PageGrid>
    </QueryState>
  );
}
