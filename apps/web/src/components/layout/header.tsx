'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';

const titles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Una lectura rápida de tu operación comercial.' },
  '/revenue': {
    title: 'Revenue Intelligence',
    subtitle: 'Métricas comerciales y señales ejecutivas.',
  },
  '/revenue/kpis': { title: 'KPIs', subtitle: 'Indicadores comerciales calculados desde el core.' },
  '/revenue/funnels': { title: 'Funnels', subtitle: 'Conversión configurable por etapa.' },
  '/revenue/cohorts': { title: 'Cohortes', subtitle: 'Retención y revenue de clientes.' },
  '/revenue/trends': { title: 'Tendencias', subtitle: 'Evolución histórica de los indicadores.' },
  '/revenue/forecast': { title: 'Forecast', subtitle: 'Proyección histórica básica.' },
  '/my-day': { title: 'Mi Día', subtitle: 'Prioriza el trabajo que mueve el negocio.' },
  '/contacts': { title: 'Contactos', subtitle: 'Tu relación comercial en un solo lugar.' },
  '/pipeline': { title: 'Pipeline', subtitle: 'Visualiza y mueve tus oportunidades.' },
  '/sales': { title: 'Ventas', subtitle: 'Acuerdos, estados y rendimiento comercial.' },
  '/catalog': { title: 'Catálogo', subtitle: 'Productos y ofertas listas para vender.' },
  '/providers': { title: 'Providers', subtitle: 'Fuentes de entrega y capacidad operativa.' },
  '/fulfillment': {
    title: 'Fulfillment',
    subtitle: 'Obligaciones de entrega pendientes y en curso.',
  },
  '/credentials': {
    title: 'Credenciales',
    subtitle: 'Entrega información operativa de forma segura.',
  },
  '/trials': { title: 'Trials', subtitle: 'Demos activas, próximas a vencer y convertidas.' },
  '/activations': { title: 'Activaciones', subtitle: 'Servicios operativos y su estado actual.' },
  '/automations': {
    title: 'Automatizaciones',
    subtitle: 'Reglas internas disparadas por eventos del negocio.',
  },
  '/templates': {
    title: 'Plantillas',
    subtitle: 'Mensajes reutilizables con variables dinámicas.',
  },
  '/notifications': {
    title: 'Notificaciones',
    subtitle: 'Centro interno de avisos de tu organización.',
  },
  '/automation-executions': {
    title: 'Ejecuciones',
    subtitle: 'Historial y diagnóstico del motor de automatización.',
  },
};

export function Header(): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const title = titles[pathname] ?? { title: 'Workspace', subtitle: 'SuperFlash CRM' };
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const logout = async () => {
    await api.logout().catch(() => undefined);
    clearSession();
    router.replace('/login');
  };
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-slate-50/85 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 sm:px-6 lg:ml-[260px] lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="Colapsar sidebar"
            className="hidden h-9 w-9 items-center justify-center rounded-xl text-lg text-slate-500 hover:bg-white dark:hover:bg-slate-900 lg:flex"
            onClick={toggleSidebar}
            type="button"
          >
            ☰
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 dark:text-white">
              {title.title}
            </h1>
            <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
              {title.subtitle}
            </p>
          </div>
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
            ◐
          </button>
          <div className="hidden h-7 w-px bg-slate-200 dark:bg-slate-800 sm:block" />
          <button
            className="hidden text-right sm:block"
            onClick={() => router.push('/')}
            type="button"
          >
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {user?.firstName}
            </p>
            <p className="text-[10px] text-slate-400">{user?.organization.name}</p>
          </button>
          <button
            aria-label="Cerrar sesión"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white"
            onClick={() => void logout()}
            type="button"
          >
            {user?.firstName.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </div>
      <div className="mt-3 lg:hidden">
        <Link className="text-xs font-bold text-brand-600" href="/">
          ← Workspace
        </Link>
      </div>
    </header>
  );
}
