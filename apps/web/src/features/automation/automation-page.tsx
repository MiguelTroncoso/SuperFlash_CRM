'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';

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
import type { AutomationRule } from '@/lib/types';

const triggers = [
  'CONTACT_CREATED',
  'OPPORTUNITY_STAGE_CHANGED',
  'SALE_CONFIRMED',
  'PAYMENT_CONFIRMED',
  'TRIAL_EXPIRING',
  'TRIAL_EXPIRED',
  'SUBSCRIPTION_RENEWAL_DUE',
  'FULFILLMENT_COMPLETED',
  'ACTIVATION_CREATED',
] as const;

const actions = [
  'CREATE_TASK',
  'CREATE_NOTIFICATION',
  'ADD_ACTIVITY',
  'CREATE_FOLLOW_UP',
  'ENQUEUE_OUTBOX',
  'INTERNAL_WEBHOOK',
] as const;

const schema = z.object({
  name: z.string().min(2).max(120),
  trigger: z.enum(triggers),
  actionType: z.enum(actions),
  actionTitle: z.string().max(160).optional(),
  actionBody: z.string().max(2_000).optional(),
});

type FormValues = z.infer<typeof schema>;

const labels: Record<string, string> = {
  CONTACT_CREATED: 'Contacto creado',
  OPPORTUNITY_STAGE_CHANGED: 'Cambio de etapa',
  SALE_CONFIRMED: 'Venta confirmada',
  PAYMENT_CONFIRMED: 'Pago confirmado',
  TRIAL_EXPIRING: 'Trial por vencer',
  TRIAL_EXPIRED: 'Trial vencido',
  SUBSCRIPTION_RENEWAL_DUE: 'Renovación pendiente',
  FULFILLMENT_COMPLETED: 'Entrega completada',
  ACTIVATION_CREATED: 'Activación creada',
  CREATE_TASK: 'Crear tarea',
  CREATE_NOTIFICATION: 'Crear notificación',
  ADD_ACTIVITY: 'Agregar actividad',
  CREATE_FOLLOW_UP: 'Crear follow-up',
  ENQUEUE_OUTBOX: 'Enviar al Outbox',
  INTERNAL_WEBHOOK: 'Webhook interno mock',
};

export function AutomationPage(): React.ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      trigger: 'CONTACT_CREATED',
      actionType: 'CREATE_NOTIFICATION',
      actionTitle: 'Nuevo evento comercial',
      actionBody: 'Se generó una nueva actividad en tu organización.',
    },
  });
  const rules = useQuery({
    queryKey: ['automations'],
    queryFn: () => api.getAutomations(queryString({ page: 1, limit: 100 })),
  });
  const create = useMutation({
    mutationFn: (values: FormValues) =>
      api.createAutomation({
        name: values.name,
        trigger: values.trigger,
        active: true,
        actions: [
          {
            actionOrder: 1,
            type: values.actionType,
            config: { title: values.actionTitle ?? '', body: values.actionBody ?? '' },
          },
        ],
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automations'] });
      setDrawerOpen(false);
      form.reset();
      toast({ title: 'Automatización creada', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible crearla', description: error.message, tone: 'error' }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.toggleAutomation(id, active),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast({ title: 'Estado actualizado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible actualizarla', description: error.message, tone: 'error' }),
  });
  const records = rules.data?.data ?? [];
  return (
    <QueryState
      isError={rules.isError}
      isLoading={rules.isLoading}
      onRetry={() => void rules.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Communications engine"
          title="Automatizaciones"
          description="Define respuestas operativas sobre eventos internos del negocio, con ejecución durable y auditable."
          actions={
            <PermissionGate permission="automations.create">
              <Button onClick={() => setDrawerOpen(true)}>＋ Nueva automatización</Button>
            </PermissionGate>
          }
        />
        {records.length === 0 ? (
          <EmptyState
            title="Aún no hay automatizaciones"
            description="Crea la primera regla para convertir eventos comerciales en acciones operativas."
            action={
              <PermissionGate permission="automations.create">
                <Button onClick={() => setDrawerOpen(true)}>Crear regla</Button>
              </PermissionGate>
            }
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {records.map((rule: AutomationRule) => (
              <Card key={rule.id}>
                <CardHeader>
                  <div>
                    <CardTitle>{rule.name}</CardTitle>
                    <CardDescription>{labels[rule.trigger] ?? rule.trigger}</CardDescription>
                  </div>
                  <StatusBadge status={rule.active ? 'ACTIVE' : 'INACTIVE'} />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {rule.actions.length} {rule.actions.length === 1 ? 'acción' : 'acciones'}
                    </span>
                    {rule.template ? (
                      <span className="rounded-lg bg-brand-50 px-2.5 py-1.5 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                        Plantilla: {rule.template.name}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-400">
                      Actualizada {new Date(rule.updatedAt).toLocaleDateString()}
                    </p>
                    <PermissionGate permission="automations.update">
                      <Button
                        onClick={() => toggle.mutate({ id: rule.id, active: !rule.active })}
                        size="sm"
                        variant="outline"
                      >
                        {rule.active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </PermissionGate>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Drawer
          description="La regla se evaluará cuando el evento se confirme en el Outbox interno."
          onClose={() => setDrawerOpen(false)}
          open={drawerOpen}
          title="Nueva automatización"
        >
          <form
            className="space-y-4"
            onSubmit={(event) => void form.handleSubmit((values) => create.mutate(values))(event)}
          >
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Nombre
              <Input className="mt-2" {...form.register('name')} placeholder="Avisar nuevo lead" />
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Trigger
              <Select className="mt-2" {...form.register('trigger')}>
                {triggers.map((trigger) => (
                  <option key={trigger} value={trigger}>
                    {labels[trigger]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Acción
              <Select className="mt-2" {...form.register('actionType')}>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {labels[action]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Título de la acción
              <Input className="mt-2" {...form.register('actionTitle')} />
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Contenido
              <Textarea className="mt-2" {...form.register('actionBody')} />
            </label>
            {form.formState.errors.name ? (
              <p className="text-xs text-rose-600">{form.formState.errors.name.message}</p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setDrawerOpen(false)} type="button" variant="outline">
                Cancelar
              </Button>
              <Button disabled={create.isPending} type="submit">
                {create.isPending ? 'Guardando…' : 'Crear regla'}
              </Button>
            </div>
          </form>
        </Drawer>
      </PageGrid>
    </QueryState>
  );
}
