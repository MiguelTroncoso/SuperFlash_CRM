'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';

const PAGE_LABELS: Record<string, string> = {
  activations: 'Activaciones',
  agenda: 'Agenda operativa',
  automations: 'Automatizaciones',
  'business-intelligence': 'Business Intelligence',
  catalog: 'Catálogo',
  contacts: 'Contactos',
  credentials: 'Credenciales',
  customers: 'Customer 360',
  fulfillment: 'Fulfillment',
  'my-day': 'Mi Día',
  notifications: 'Notificaciones',
  pipeline: 'Pipeline',
  profile: 'Mi perfil',
  providers: 'Providers',
  renewals: 'Renovaciones',
  revenue: 'Revenue Intelligence',
  sales: 'Ventas',
  templates: 'Plantillas',
  trials: 'Trials',
  whatsapp: 'WhatsApp',
};

function pageLabel(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  const segment = pathname.split('/').filter(Boolean).at(-1) ?? 'Dashboard';
  return PAGE_LABELS[segment] ?? segment.replaceAll('-', ' ');
}

export function Header(): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setMobileSidebarOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const setTheme = useUiStore((state) => state.setTheme);
  const theme = useUiStore((state) => state.theme);
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const logout = async (): Promise<void> => {
    if (!window.confirm('¿Quieres cerrar la sesión actual?')) return;
    await api.logout().catch(() => undefined);
    clearSession();
    router.replace('/login');
  };

  return (
    <header className="safe-area-top sticky top-0 z-50 border-b border-border-default bg-surface-page/95 px-3 py-2 backdrop-blur sm:px-6 sm:py-3 lg:px-8">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            aria-label="Abrir navegación"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg text-content-secondary hover:bg-surface-muted lg:hidden"
            onClick={() => setMobileSidebarOpen(true)}
            type="button"
          >
            ☰
          </button>
          <button
            aria-label="Colapsar sidebar"
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg text-content-secondary hover:bg-surface-muted lg:flex"
            onClick={toggleSidebar}
            type="button"
          >
            ☰
          </button>
          <span className="truncate text-sm font-bold text-content-primary sm:hidden">
            {pageLabel(pathname)}
          </span>
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <span className="text-sm font-black tracking-tight text-content-primary">
              SuperFlash
            </span>
            <span className="text-xs text-content-muted">/ {pageLabel(pathname)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Abrir comandos"
            className="hidden items-center gap-3 rounded-xl border border-border-default bg-surface-card px-3 py-2 text-xs text-content-muted shadow-sm hover:border-brand-300 sm:flex"
            onClick={() => setCommandOpen(true)}
            type="button"
          >
            <span>⌕ Buscar</span>
            <kbd className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>
          <button
            aria-label="Cambiar tema"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-lg text-content-secondary hover:bg-surface-muted"
            onClick={toggleTheme}
            type="button"
          >
            {theme === 'dark' ? '☾' : '☀'}
          </button>
          <div className="relative" ref={menuRef}>
            <button
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Abrir menú de usuario"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white"
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
            >
              {user?.firstName.slice(0, 1).toUpperCase()}
            </button>
            {menuOpen ? (
              <div
                className="user-menu-panel absolute right-0 top-[calc(100%+0.5rem)] z-[70] w-72 rounded-2xl border border-border-default bg-surface-card p-2 shadow-xl"
                role="menu"
                aria-label="Menú de usuario"
              >
                <div className="border-b border-border-subtle px-3 py-3">
                  <p className="text-sm font-bold text-content-primary">
                    {user?.firstName} {user?.lastName ?? ''}
                  </p>
                  <p className="truncate text-xs text-content-muted">{user?.email}</p>
                  <p className="mt-1 text-[11px] text-content-muted">{user?.organization.name}</p>
                </div>
                <Link
                  className="menu-item"
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                >
                  Mi perfil
                </Link>
                <Link
                  className="menu-item"
                  href="/profile?section=preferences"
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                >
                  Preferencias
                </Link>
                <Link
                  className="menu-item"
                  href="/profile?section=organization"
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                >
                  Organización
                </Link>
                <div className="my-1 border-t border-border-subtle pt-1">
                  <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-content-muted">
                    Apariencia
                  </p>
                  <div className="grid grid-cols-3 gap-1 px-2">
                    {(['light', 'system', 'dark'] as const).map((option) => (
                      <button
                        className={`rounded-lg px-2 py-2 text-xs ${theme === option ? 'bg-brand-50 font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : 'text-content-secondary hover:bg-surface-muted'}`}
                        key={option}
                        onClick={() => setTheme(option)}
                        type="button"
                      >
                        {option === 'light' ? 'Claro' : option === 'dark' ? 'Oscuro' : 'Sistema'}
                      </button>
                    ))}
                  </div>
                </div>
                <Link
                  className="menu-item"
                  href="/profile?section=security"
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                >
                  Seguridad
                </Link>
                <button
                  className="menu-item w-full text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  onClick={() => void logout()}
                  role="menuitem"
                  type="button"
                >
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
