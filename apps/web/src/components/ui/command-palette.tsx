'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useUiStore } from '@/lib/ui-store';

import { Input } from './input';

const commands = [
  { label: 'Dashboard', href: '/' },
  { label: 'Mi Día', href: '/my-day' },
  { label: 'Contactos', href: '/contacts' },
  { label: 'Pipeline', href: '/pipeline' },
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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-100 p-3 dark:border-slate-800">
          <Input autoFocus placeholder="Ir a..." />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {commands.map((command) => (
            <button
              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              key={command.href}
              onClick={() => {
                setOpen(false);
                router.push(command.href);
              }}
              type="button"
            >
              <span>{command.label}</span>
              <span className="text-xs text-slate-400">↵</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
