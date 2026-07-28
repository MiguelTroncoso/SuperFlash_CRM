'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { api } from '@/lib/api-client';
import type { Notification } from '@/lib/types';

export function NotificationsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getNotifications('?limit=100'),
  });
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  const read = useMutation({
    mutationFn: (id: string) => api.readNotification(id),
    onSuccess: refresh,
    onError: (error: Error) =>
      toast({ title: 'No fue posible marcarla', description: error.message, tone: 'error' }),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.archiveNotification(id),
    onSuccess: refresh,
    onError: (error: Error) =>
      toast({ title: 'No fue posible archivarla', description: error.message, tone: 'error' }),
  });
  const readAll = useMutation({ mutationFn: () => api.readAllNotifications(), onSuccess: refresh });
  const records = notifications.data?.data ?? [];
  return (
    <QueryState
      isError={notifications.isError}
      isLoading={notifications.isLoading}
      onRetry={() => void notifications.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Communications engine"
          title="Notificaciones"
          description="Centro interno de avisos generados por las operaciones de tu organización."
          actions={
            <Button
              disabled={readAll.isPending || (notifications.data?.unread ?? 0) === 0}
              onClick={() => readAll.mutate()}
              variant="outline"
            >
              Marcar todo como leído
            </Button>
          }
        />
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="rounded-full bg-brand-100 px-3 py-1 font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            {notifications.data?.unread ?? 0} sin leer
          </span>
          <span>{records.length} visibles</span>
        </div>
        {records.length === 0 ? (
          <EmptyState
            title="Bandeja tranquila"
            description="Las notificaciones operativas aparecerán aquí cuando una automatización genere un aviso."
          />
        ) : (
          <div className="space-y-3">
            {records.map((notification: Notification) => (
              <Card
                className={
                  notification.status === 'UNREAD'
                    ? 'border-brand-200 dark:border-brand-500/30'
                    : ''
                }
                key={notification.id}
              >
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900 dark:text-white">
                        {notification.title}
                      </p>
                      <StatusBadge status={notification.status} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      {notification.body}
                    </p>
                    <p className="mt-3 text-xs text-slate-400">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      disabled={notification.status !== 'UNREAD' || read.isPending}
                      onClick={() => read.mutate(notification.id)}
                      size="sm"
                      variant="outline"
                    >
                      Leer
                    </Button>
                    <Button
                      disabled={archive.isPending}
                      onClick={() => archive.mutate(notification.id)}
                      size="sm"
                      variant="ghost"
                    >
                      Archivar
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageGrid>
    </QueryState>
  );
}
