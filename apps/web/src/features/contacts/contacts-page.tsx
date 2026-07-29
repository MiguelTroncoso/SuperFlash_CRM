'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';

import { PageHeader, PageGrid } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SearchBar } from '@/components/ui/search-bar';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { ContactForm, type ContactFormValues } from './contact-form';
import { api, queryString } from '@/lib/api-client';
import type { Contact } from '@/lib/types';

function ContactWhatsAppTab({ contact }: { readonly contact: Contact }): React.ReactElement {
  const conversations = useQuery({
    queryKey: ['contact-whatsapp', contact.id, contact.phone],
    queryFn: () => api.getWhatsAppConversations(queryString({ search: contact.phone ?? '' })),
    enabled: Boolean(contact.phone),
  });
  const rows = conversations.data?.data ?? [];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">WhatsApp</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {contact.phone
            ? `Conversaciones asociadas a ${contact.phone}.`
            : 'Este contacto no tiene teléfono.'}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No hay conversaciones de WhatsApp para este contacto.
        </p>
      ) : (
        rows.map((conversation) => (
          <a
            className="block rounded-2xl border border-slate-200 p-4 hover:border-brand-300 dark:border-slate-800"
            href={`/whatsapp?conversation=${conversation.id}`}
            key={conversation.id}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-slate-900 dark:text-white">
                {conversation.externalContactPhoneNormalized}
              </span>
              <StatusBadge status={conversation.status} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {conversation.unreadCount} mensajes sin leer
            </p>
          </a>
        ))
      )}
    </div>
  );
}

export function ContactsPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState<'create' | 'edit' | null>(null);
  const [drawerTab, setDrawerTab] = useState<'details' | 'whatsapp'>('details');
  const [selected, setSelected] = useState<Contact | null>(null);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const contacts = useQuery({
    queryKey: ['contacts', page, search],
    queryFn: () => api.getContacts(queryString({ page, limit: 25, search })),
  });
  const create = useMutation({
    mutationFn: (values: ContactFormValues) =>
      api.createContact({ ...values, createOpportunity: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setDrawer(null);
      toast({
        title: 'Contacto creado',
        description: 'El lead fue registrado correctamente.',
        tone: 'success',
      });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible guardar', description: error.message, tone: 'error' }),
  });
  const update = useMutation({
    mutationFn: (values: ContactFormValues) =>
      selected
        ? api.updateContact(selected.id, values)
        : Promise.reject(new Error('Contacto no seleccionado.')),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setDrawer(null);
      toast({ title: 'Contacto actualizado', tone: 'success' });
    },
    onError: (error: Error) =>
      toast({ title: 'No fue posible actualizar', description: error.message, tone: 'error' }),
  });
  const columns: ColumnDef<Contact, unknown>[] = [
    {
      accessorKey: 'displayName',
      header: 'Contacto',
      cell: ({ row }) => (
        <button
          className="text-left"
          onClick={() => {
            setSelected(row.original);
            setDrawer('edit');
            setDrawerTab('details');
          }}
          type="button"
        >
          <p className="font-bold text-slate-800 hover:text-brand-600 dark:text-slate-100">
            {row.original.displayName ?? 'Lead sin nombre'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {row.original.email ?? row.original.phone ?? 'Sin dato de contacto'}
          </p>
        </button>
      ),
    },
    {
      accessorKey: 'country',
      header: 'País',
      cell: ({ row }) => <span>{row.original.country ?? '—'}</span>,
    },
    {
      accessorKey: 'source',
      header: 'Fuente',
      cell: ({ row }) => (
        <span className="text-xs font-semibold">{row.original.source ?? 'MANUAL'}</span>
      ),
    },
    {
      accessorKey: 'assignedTo',
      header: 'Responsable',
      cell: ({ row }) => (
        <span>
          {row.original.assignedTo
            ? `${row.original.assignedTo.firstName} ${row.original.assignedTo.lastName ?? ''}`
            : 'Sin asignar'}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }) => (
        <StatusBadge
          status={
            row.original.archivedAt ? 'ARCHIVED' : row.original.isCustomer ? 'ACTIVE' : 'OPEN'
          }
        />
      ),
    },
  ];
  const data = contacts.data?.data ?? [];
  return (
    <QueryState
      isError={contacts.isError}
      isLoading={contacts.isLoading}
      onRetry={() => void contacts.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="CRM"
          title="Contactos"
          description="Gestiona leads, clientes y la información que alimenta tu pipeline."
          actions={
            <Button
              onClick={() => {
                setSelected(null);
                setDrawer('create');
                setDrawerTab('details');
              }}
            >
              ＋ Nuevo contacto
            </Button>
          }
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchBar
            className="sm:max-w-sm"
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Buscar por nombre, correo o teléfono"
            value={search}
          />
          <Input
            className="w-full sm:w-36"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="País"
          />
        </div>
        <Card>
          <DataTable
            columns={columns}
            data={data}
            emptyDescription="Crea tu primer contacto para comenzar a construir relaciones comerciales."
            emptyTitle="No hay contactos"
            virtualize
          />
          <Pagination
            onPageChange={setPage}
            page={page}
            totalPages={contacts.data?.pagination.totalPages ?? 1}
          />
        </Card>
        <Drawer
          description={
            drawer === 'create'
              ? 'Registra un nuevo lead en tu organización.'
              : 'Actualiza los datos públicos del contacto.'
          }
          onClose={() => setDrawer(null)}
          open={drawer !== null}
          title={drawer === 'create' ? 'Nuevo contacto' : 'Editar contacto'}
        >
          {drawer === 'edit' && selected ? (
            <div className="mb-5 flex gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
              <Button
                onClick={() => setDrawerTab('details')}
                size="sm"
                variant={drawerTab === 'details' ? 'primary' : 'ghost'}
              >
                Datos
              </Button>
              <Button
                onClick={() => setDrawerTab('whatsapp')}
                size="sm"
                variant={drawerTab === 'whatsapp' ? 'primary' : 'ghost'}
              >
                WhatsApp
              </Button>
            </div>
          ) : null}
          {drawerTab === 'whatsapp' && selected ? (
            <ContactWhatsAppTab contact={selected} />
          ) : (
            <ContactForm
              contact={selected}
              onCancel={() => setDrawer(null)}
              onSubmit={(values) => {
                if (drawer === 'create') create.mutate(values);
                else update.mutate(values);
              }}
              submitting={create.isPending || update.isPending}
            />
          )}
        </Drawer>
      </PageGrid>
    </QueryState>
  );
}
