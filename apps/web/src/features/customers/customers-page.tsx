'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Textarea } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SearchBar } from '@/components/ui/search-bar';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { api, queryString } from '@/lib/api-client';
import type { CustomerSummary } from '@/lib/types';

interface CustomerForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  notes: string;
}

const emptyForm: CustomerForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  country: 'CL',
  notes: '',
};

function formatDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })
    : '—';
}

function totalLabel(customer: CustomerSummary): string {
  return (
    customer.purchasedTotals.map((item) => `${item.currency} ${item.amount}`).join(' · ') || '—'
  );
}

export function CustomersPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<CustomerSummary | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerSummary | null>(null);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const customers = useQuery({
    queryKey: ['customers', page, search, showArchived],
    queryFn: () =>
      api.getCustomers(queryString({ page, limit: 25, search, archived: showArchived })),
  });
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        firstName: form.firstName || null,
        lastName: form.lastName || null,
        email: form.email || null,
        phone: form.phone || null,
        country: form.country || null,
        notes: form.notes || null,
        createOpportunity: false,
      };
      return selected ? api.updateCustomer(selected.id, payload) : api.createCustomer(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      setEditorOpen(false);
      setSelected(null);
      toast({ title: selected ? 'Cliente actualizado' : 'Cliente creado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible guardar', description: error.message, tone: 'error' }),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.deactivateCustomer(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Cliente desactivado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible desactivar', description: error.message, tone: 'error' }),
  });
  const activate = useMutation({
    mutationFn: (id: string) => api.activateCustomer(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Cliente activado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible activar', description: error.message, tone: 'error' }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCustomer(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDeleteTarget(null);
      toast({ title: 'Cliente eliminado', tone: 'success' });
    },
    onError: (error: Error) => {
      setDeleteTarget(null);
      toast({ title: 'No se puede eliminar', description: error.message, tone: 'error' });
    },
  });

  useEffect(() => {
    if (!selected) setForm(emptyForm);
  }, [selected]);

  return (
    <QueryState
      isError={customers.isError}
      isLoading={customers.isLoading}
      onRetry={() => void customers.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Relación comercial"
          title="Clientes"
          description="Una vista operativa de todos los clientes y su historial comercial."
          actions={
            <Button
              onClick={() => {
                setSelected(null);
                setForm(emptyForm);
                setEditorOpen(true);
              }}
            >
              ＋ Nuevo cliente
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <SearchBar
            className="max-w-md"
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Buscar nombre, teléfono o correo..."
            value={search}
          />
          <Button
            onClick={() => {
              setPage(1);
              setShowArchived((value) => !value);
            }}
            variant="outline"
          >
            {showArchived ? 'Ver activos' : 'Ver inactivos'}
          </Button>
        </div>
        <Card className="overflow-hidden">
          {customers.data?.data.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-surface-muted text-xs uppercase tracking-wide text-content-muted">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Teléfono</th>
                    <th className="px-4 py-3">Correo</th>
                    <th className="px-4 py-3">País</th>
                    <th className="px-4 py-3">Compras</th>
                    <th className="px-4 py-3">Total comprado</th>
                    <th className="px-4 py-3">Última compra</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {customers.data.data.map((customer) => (
                    <tr key={customer.id}>
                      <td className="px-4 py-3 font-semibold text-content-primary">
                        <Link className="hover:text-brand-600" href={`/customers/${customer.id}`}>
                          {customer.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-content-secondary">{customer.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-content-secondary">{customer.email ?? '—'}</td>
                      <td className="px-4 py-3 text-content-secondary">
                        {customer.country ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-bold text-content-primary">
                        {customer.purchaseCount}
                      </td>
                      <td className="px-4 py-3 text-content-secondary">{totalLabel(customer)}</td>
                      <td className="px-4 py-3 text-content-secondary">
                        {formatDate(customer.lastPurchaseAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={customer.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => {
                              setSelected(customer);
                              setForm({
                                firstName: customer.firstName ?? '',
                                lastName: customer.lastName ?? '',
                                email: customer.email ?? '',
                                phone: customer.phone ?? '',
                                country: customer.country ?? '',
                                notes: customer.notes ?? '',
                              });
                              setEditorOpen(true);
                            }}
                            size="sm"
                            variant="outline"
                          >
                            Editar
                          </Button>
                          {customer.status === 'ACTIVE' ? (
                            <Button
                              disabled={deactivate.isPending}
                              onClick={() => deactivate.mutate(customer.id)}
                              size="sm"
                              variant="outline"
                            >
                              Desactivar
                            </Button>
                          ) : (
                            <Button
                              disabled={activate.isPending}
                              onClick={() => activate.mutate(customer.id)}
                              size="sm"
                              variant="outline"
                            >
                              Activar
                            </Button>
                          )}
                          <Button
                            onClick={() => setDeleteTarget(customer)}
                            size="sm"
                            variant="danger"
                          >
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              description="Los clientes creados desde contactos y ventas aparecerán aquí."
              title="No hay clientes"
            />
          )}
          <Pagination
            onPageChange={setPage}
            page={page}
            totalPages={customers.data?.pagination.totalPages ?? 1}
          />
        </Card>
      </PageGrid>
      <Drawer
        description="Los cambios se validan y auditan en el backend."
        onClose={() => setEditorOpen(false)}
        open={editorOpen}
        title={selected ? 'Editar cliente' : 'Nuevo cliente'}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          {(['firstName', 'lastName', 'email', 'phone', 'country', 'notes'] as const).map(
            (field) => (
              <label
                className="block space-y-1 text-sm font-semibold text-content-primary"
                key={field}
              >
                <span>
                  {field === 'firstName'
                    ? 'Nombre'
                    : field === 'lastName'
                      ? 'Apellido'
                      : field === 'email'
                        ? 'Correo'
                        : field === 'phone'
                          ? 'Teléfono'
                          : field === 'country'
                            ? 'País'
                            : 'Notas'}
                </span>
                {field === 'notes' ? (
                  <Textarea
                    value={form[field]}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [field]: event.target.value }))
                    }
                  />
                ) : (
                  <Input
                    value={form[field]}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [field]: event.target.value }))
                    }
                  />
                )}
              </label>
            ),
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditorOpen(false)} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={save.isPending} type="submit">
              {save.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Drawer>
      <ConfirmDialog
        confirmLabel="Eliminar cliente"
        description="Solo se puede eliminar un cliente sin historial comercial. Los clientes con ventas deben desactivarse."
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id);
        }}
        open={Boolean(deleteTarget)}
        title="Eliminar cliente"
      />
    </QueryState>
  );
}
