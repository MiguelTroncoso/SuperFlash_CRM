'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';

import { PageHeader, PageGrid } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { CountrySelect } from '@/components/shared/country-phone-field';
import { Select } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SearchBar } from '@/components/ui/search-bar';
import { StatusBadge } from '@/components/ui/badge';
import { useToastStore } from '@/components/ui/toast';
import { LeadIntakeDrawer } from '@/features/leads/lead-intake-drawer';
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
      <div className="rounded-2xl bg-surface-inset p-4">
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

export function ContactsPage({
  operational = false,
}: {
  readonly operational?: boolean;
}): React.ReactElement {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [tagId, setTagId] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [drawer, setDrawer] = useState<'edit' | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'details' | 'whatsapp'>('details');
  const [selected, setSelected] = useState<Contact | null>(null);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const contacts = useQuery({
    queryKey: ['contacts', { page, search, country, tagId, assignedUserId, sortBy, sortOrder }],
    queryFn: () =>
      api.getContacts(
        queryString({
          page,
          limit: 25,
          search,
          country,
          tagId,
          assignedUserId,
          sortBy,
          sortOrder,
        }),
      ),
  });
  const tags = useQuery({ queryKey: ['tags'], queryFn: api.getTags });
  const assignees = useQuery({
    queryKey: ['contact-assignees'],
    queryFn: api.getContactAssignees,
  });
  useEffect(() => {
    const raw = window.sessionStorage.getItem('superflash-contact-filters');
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as {
        page?: number;
        searchInput?: string;
        search?: string;
        country?: string;
        tagId?: string;
        assignedUserId?: string;
        sortBy?: string;
        sortOrder?: string;
      };
      if (saved.page && saved.page > 0) setPage(saved.page);
      if (saved.searchInput !== undefined) setSearchInput(saved.searchInput);
      if (saved.search !== undefined) setSearch(saved.search);
      if (saved.country !== undefined) setCountry(saved.country);
      if (saved.tagId !== undefined) setTagId(saved.tagId);
      if (saved.assignedUserId !== undefined) setAssignedUserId(saved.assignedUserId);
      if (saved.sortBy !== undefined) setSortBy(saved.sortBy);
      if (saved.sortOrder !== undefined) setSortOrder(saved.sortOrder);
    } catch {
      window.sessionStorage.removeItem('superflash-contact-filters');
    }
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      'superflash-contact-filters',
      JSON.stringify({
        page,
        searchInput,
        search,
        country,
        tagId,
        assignedUserId,
        sortBy,
        sortOrder,
      }),
    );
  }, [assignedUserId, country, page, search, searchInput, sortBy, sortOrder, tagId]);
  const update = useMutation({
    mutationFn: (values: ContactFormValues) => {
      const { tagIds: _tagIds, ...editable } = values;
      return selected
        ? api.updateContact(selected.id, editable)
        : Promise.reject(new Error('Contacto no seleccionado.'));
    },
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
        <div className="text-left">
          <button
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
          <Link
            className="mt-2 inline-block text-[11px] font-bold text-brand-600 hover:text-brand-700"
            href={`/sales?contactId=${row.original.id}`}
          >
            Ver ventas →
          </Link>
        </div>
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
          eyebrow={operational ? 'Operación comercial' : 'Base maestra'}
          title={operational ? 'Leads' : 'Contactos'}
          description={
            operational
              ? 'Registra y mueve oportunidades sin salir del flujo comercial.'
              : 'Consulta la base maestra de clientes y su historial comercial.'
          }
          actions={<Button onClick={() => setLeadOpen(true)}>＋ Registrar Lead</Button>}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchBar
            className="sm:max-w-sm"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por nombre, correo o teléfono"
            value={searchInput}
          />
          <CountrySelect
            className="w-full sm:w-56"
            onChange={(value) => {
              setPage(1);
              setCountry(value);
            }}
            value={country}
          />
          <Select
            className="w-full sm:w-56"
            onChange={(event) => {
              setPage(1);
              setTagId(event.target.value);
            }}
            value={tagId}
          >
            <option value="">Todas las etiquetas</option>
            {(tags.data ?? []).map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-full sm:w-56"
            onChange={(event) => {
              setPage(1);
              setAssignedUserId(event.target.value);
            }}
            value={assignedUserId}
          >
            <option value="">Todos los responsables</option>
            {(assignees.data ?? []).map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.firstName} {assignee.lastName ?? ''}
              </option>
            ))}
          </Select>
          <Select
            className="w-full sm:w-48"
            onChange={(event) => {
              setPage(1);
              setSortBy(event.target.value);
            }}
            value={sortBy}
          >
            <option value="createdAt">Más recientes</option>
            <option value="updatedAt">Última actualización</option>
            <option value="lastActivityAt">Última actividad</option>
            <option value="firstName">Nombre</option>
            <option value="country">País</option>
          </Select>
          <Select
            className="w-full sm:w-36"
            onChange={(event) => {
              setPage(1);
              setSortOrder(event.target.value);
            }}
            value={sortOrder}
          >
            <option value="desc">Descendente</option>
            <option value="asc">Ascendente</option>
          </Select>
        </div>
        <Card>
          <DataTable
            columns={columns}
            data={data}
            emptyDescription="Crea tu primer contacto para comenzar a construir relaciones comerciales."
            emptyTitle="No hay contactos"
            emptyAction={
              <Button onClick={() => setLeadOpen(true)} size="sm">
                Registrar primer lead
              </Button>
            }
            virtualize
          />
          <Pagination
            onPageChange={setPage}
            page={page}
            totalPages={contacts.data?.pagination.totalPages ?? 1}
          />
        </Card>
        <Drawer
          description="Actualiza los datos públicos del contacto."
          onClose={() => setDrawer(null)}
          open={drawer !== null}
          title="Editar contacto"
        >
          {selected ? (
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
          ) : selected ? (
            <ContactForm
              contact={selected}
              onCancel={() => setDrawer(null)}
              onSubmit={(values) => update.mutate(values)}
              tags={tags.data ?? []}
              submitting={update.isPending}
            />
          ) : null}
        </Drawer>
        <LeadIntakeDrawer onClose={() => setLeadOpen(false)} open={leadOpen} />
      </PageGrid>
    </QueryState>
  );
}
