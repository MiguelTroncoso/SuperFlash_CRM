'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuthStore } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: string;
}
const sections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', href: '/', icon: '⌂' },
      { label: 'Mi Día', href: '/my-day', icon: '◷', permission: 'followups.read' },
      { label: 'Revenue Intelligence', href: '/revenue', icon: '▥', permission: 'reports.read' },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { label: 'Contactos', href: '/contacts', icon: '◎', permission: 'contacts.read' },
      { label: 'Pipeline', href: '/pipeline', icon: '◇', permission: 'opportunities.read' },
      { label: 'Ventas', href: '/sales', icon: '↗', permission: 'sales.read' },
      { label: 'Catálogo', href: '/catalog', icon: '▦', permission: 'catalog.read' },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { label: 'Providers', href: '/providers', icon: '◈', permission: 'providers.read' },
      { label: 'Fulfillment', href: '/fulfillment', icon: '⚙', permission: 'fulfillments.read' },
      { label: 'Credenciales', href: '/credentials', icon: '▣', permission: 'credentials.read' },
      { label: 'Trials', href: '/trials', icon: '◌', permission: 'trials.read' },
      { label: 'Activaciones', href: '/activations', icon: '✓', permission: 'activations.read' },
    ],
  },
  {
    label: 'Comunicaciones',
    items: [
      {
        label: 'Automatizaciones',
        href: '/automations',
        icon: '↯',
        permission: 'automations.read',
      },
      { label: 'Plantillas', href: '/templates', icon: '✎', permission: 'templates.read' },
      {
        label: 'Notificaciones',
        href: '/notifications',
        icon: '●',
        permission: 'notifications.read',
      },
      {
        label: 'Ejecuciones',
        href: '/automation-executions',
        icon: '↻',
        permission: 'automation_executions.read',
      },
    ],
  },
];

export function Sidebar(): React.ReactElement {
  const pathname = usePathname();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const user = useAuthStore((state) => state.user);
  const canSee = (item: NavItem) => !item.permission || user?.permissions.includes(item.permission);
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden border-r border-slate-200 bg-white/90 px-3 py-4 backdrop-blur transition-[width] dark:border-slate-800 dark:bg-slate-950/90 lg:block',
        collapsed ? 'w-[78px]' : 'w-[260px]',
      )}
      aria-label="Barra lateral de navegación"
    >
      <div className={cn('flex items-center gap-3 px-3', collapsed && 'justify-center')}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-600 font-black text-white shadow-lg shadow-brand-600/20">
          S
        </div>
        {collapsed ? null : (
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-tight text-slate-950 dark:text-white">
              SuperFlash
            </p>
            <p className="truncate text-[10px] uppercase tracking-[0.12em] text-slate-400">
              CRM workspace
            </p>
          </div>
        )}
      </div>
      <nav className="mt-8 space-y-6">
        {sections.map((section) => (
          <div key={section.label}>
            <p
              className={cn(
                'mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400',
                collapsed && 'text-center',
              )}
            >
              {collapsed ? '•••' : section.label}
            </p>
            <div className="space-y-1">
              {section.items.filter(canSee).map((item) => {
                const active =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    aria-label={item.label}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                      active
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white',
                      collapsed && 'justify-center px-2',
                    )}
                    href={item.href}
                    key={item.href}
                    title={collapsed ? item.label : undefined}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg text-base',
                        active
                          ? 'bg-white/80 dark:bg-slate-900'
                          : 'bg-slate-50 group-hover:bg-white dark:bg-slate-900 dark:group-hover:bg-slate-800',
                      )}
                    >
                      {item.icon}
                    </span>
                    {collapsed ? null : <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div
        className={cn(
          'absolute bottom-4 left-3 right-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-900',
          collapsed && 'p-2',
        )}
      >
        <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-white dark:text-slate-900">
            {user?.firstName.slice(0, 1).toUpperCase() ?? '?'}
          </div>
          {collapsed ? null : (
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                {user?.firstName} {user?.lastName ?? ''}
              </p>
              <p className="truncate text-[10px] text-slate-400">{user?.role.name}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
