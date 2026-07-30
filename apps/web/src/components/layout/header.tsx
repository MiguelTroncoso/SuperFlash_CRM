'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';

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
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const logout = async (): Promise<void> => {
    if (!window.confirm('¿Quieres cerrar la sesión actual?')) return;
    await api.logout().catch(() => undefined);
    clearSession();
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-slate-50/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            aria-label="Abrir navegación"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-lg text-slate-500 hover:bg-white dark:hover:bg-slate-900 lg:hidden"
            onClick={() => setMobileSidebarOpen(true)}
            type="button"
          >
            ☰
          </button>
          <button
            aria-label="Colapsar sidebar"
            className="hidden h-9 w-9 items-center justify-center rounded-xl text-lg text-slate-500 hover:bg-white dark:hover:bg-slate-900 lg:flex"
            onClick={toggleSidebar}
            type="button"
          >
            ☰
          </button>
          <span className="hidden text-sm font-black tracking-tight text-slate-800 dark:text-slate-100 sm:inline">
            SuperFlash Workspace
          </span>
          <span className="text-xs text-slate-400">
            {pathname === '/' ? 'Inicio' : pathname.slice(1).replaceAll('/', ' / ')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Abrir comandos"
            className="hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 shadow-sm hover:border-brand-300 sm:flex dark:border-slate-800 dark:bg-slate-900"
            onClick={() => setCommandOpen(true)}
            type="button"
          >
            <span>⌕ Buscar</span>
            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-800">
              ⌘K
            </kbd>
          </button>
          <button
            aria-label="Cambiar tema"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-lg text-slate-500 hover:bg-white dark:hover:bg-slate-900"
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
                className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900"
                role="menu"
              >
                <div className="border-b border-slate-100 px-3 py-3 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {user?.firstName} {user?.lastName ?? ''}
                  </p>
                  <p className="truncate text-xs text-slate-400">{user?.email}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{user?.organization.name}</p>
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
                <div className="my-1 border-t border-slate-100 pt-1 dark:border-slate-800">
                  <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Apariencia
                  </p>
                  <div className="grid grid-cols-3 gap-1 px-2">
                    {(['light', 'system', 'dark'] as const).map((option) => (
                      <button
                        className={`rounded-lg px-2 py-2 text-xs ${theme === option ? 'bg-brand-50 font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
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
                  className="menu-item w-full text-left text-rose-600"
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
