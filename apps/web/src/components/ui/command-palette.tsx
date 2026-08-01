'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { api, queryString } from '@/lib/api-client';
import { useUiStore } from '@/lib/ui-store';

import { Input } from './input';

const commands = [
  { label: 'Dashboard ejecutivo', href: '/' },
  { label: 'Business Intelligence', href: '/business-intelligence' },
  { label: 'Agenda operativa', href: '/agenda' },
  { label: 'Mi Día', href: '/my-day' },
  { label: 'Contactos', href: '/contacts' },
  { label: 'Pipeline avanzado', href: '/pipeline/intelligence' },
  { label: 'Ventas', href: '/sales' },
  { label: 'Catálogo', href: '/catalog' },
  { label: 'Providers', href: '/providers' },
  { label: 'Fulfillment', href: '/fulfillment' },
  { label: 'Credenciales', href: '/credentials' },
  { label: 'Trials', href: '/trials' },
  { label: 'Activaciones', href: '/activations' },
];

export function CommandPalette(): React.ReactElement | null {
  const open = useUiStore((state) => state.commandOpen);
  const setOpen = useUiStore((state) => state.setCommandOpen);
  const router = useRouter();
  const [search, setSearch] = useState('');
  const globalSearch = useQuery({
    queryKey: ['global-search', search],
    queryFn: () => api.getGlobalSearch(queryString({ search, limit: 8 })),
    enabled: open && search.trim().length >= 2,
    staleTime: 30_000,
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!open);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);
  const filtered = useMemo(
    () => commands.filter((command) => command.label.toLowerCase().includes(search.toLowerCase())),
    [search],
  );
  if (!open) return null;
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border-default bg-surface-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border-subtle p-3">
          <Input
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar páginas, clientes, ventas…"
            value={search}
          />
        </div>
        <div className="max-h-[min(28rem,60vh)] overflow-y-auto p-2">
          {search.trim().length >= 2 &&
            globalSearch.data?.results.map((result) => (
              <button
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm text-content-secondary hover:bg-surface-muted"
                key={`${result.type}-${result.id}`}
                onClick={() => go(result.href)}
                type="button"
              >
                <span>
                  <strong className="text-content-primary">{result.label}</strong>
                  <span className="ml-2 text-xs text-content-muted">
                    {result.type} · {result.detail ?? ''}
                  </span>
                </span>
                <span className="text-xs text-content-muted">↵</span>
              </button>
            ))}
          {filtered.map((command) => (
            <button
              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm text-content-secondary hover:bg-surface-muted"
              key={command.href}
              onClick={() => go(command.href)}
              type="button"
            >
              <span>{command.label}</span>
              <span className="text-xs text-content-muted">↵</span>
            </button>
          ))}
          {search.trim().length >= 2 &&
          !globalSearch.isLoading &&
          !globalSearch.data?.results.length &&
          !filtered.length ? (
            <p className="p-4 text-center text-sm text-content-muted">
              No se encontraron resultados.
            </p>
          ) : null}
        </div>
        <div className="border-t border-border-subtle px-4 py-2 text-[11px] text-content-muted">
          Ctrl/⌘ K para abrir · Esc para cerrar
        </div>
      </div>
    </div>
  );
}
