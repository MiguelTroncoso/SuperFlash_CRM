'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect } from 'react';

import { useAuthStore } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: string;
  children?: Array<{ label: string; href: string }>;
}
const sections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', href: '/', icon: '⌂' },
      { label: 'Mi Día', href: '/my-day', icon: '◷', permission: 'followups.read' },
      { label: 'Agenda operativa', href: '/agenda', icon: '▤', permission: 'followups.read' },
      {
        label: 'Business Intelligence',
        href: '/business-intelligence',
        icon: '◫',
        permission: 'reports.read',
        children: [
          { label: 'Resumen', href: '/business-intelligence' },
          { label: 'Países', href: '/business-intelligence/countries' },
          { label: 'Productos', href: '/business-intelligence/products' },
          { label: 'Campañas', href: '/business-intelligence/campaigns' },
          { label: 'Vendedores', href: '/business-intelligence/sellers' },
          { label: 'Providers', href: '/business-intelligence/providers' },
          { label: 'Renovaciones', href: '/business-intelligence/renewals' },
        ],
      },
      { label: 'Revenue Intelligence', href: '/revenue', icon: '▥', permission: 'reports.read' },
      {
        label: 'Finanzas',
        href: '/financial',
        icon: '$',
        permission: 'financial.read',
        children: [
          { label: 'Dashboard', href: '/financial' },
          { label: 'Gastos', href: '/financial/expenses' },
          { label: 'Categorías', href: '/financial/categories' },
        ],
      },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { label: 'Contactos', href: '/contacts', icon: '◎', permission: 'contacts.read' },
      {
        label: 'Pipeline',
        href: '/pipeline',
        icon: '◇',
        permission: 'opportunities.read',
        children: [
          { label: 'Kanban', href: '/pipeline' },
          { label: 'Intelligence', href: '/pipeline/intelligence' },
        ],
      },
      { label: 'Ventas', href: '/sales', icon: '↗', permission: 'sales.read' },
      {
        label: 'Renovaciones',
        href: '/renewals',
        icon: '↻',
        permission: 'renewals.read',
        children: [
          { label: 'Dashboard', href: '/renewals' },
          { label: 'Próximas', href: '/renewals/upcoming' },
          { label: 'Hoy', href: '/renewals/today' },
          { label: 'Vencidas', href: '/renewals/overdue' },
          { label: 'Calendario', href: '/renewals/calendar' },
          { label: 'Historial', href: '/renewals/history' },
        ],
      },
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
        label: 'WhatsApp',
        href: '/whatsapp',
        icon: '◉',
        permission: 'whatsapp.read',
        children: [
          { label: 'Inbox', href: '/whatsapp' },
          { label: 'Sin asignar', href: '/whatsapp?view=UNASSIGNED' },
          { label: 'Mis conversaciones', href: '/whatsapp?view=MINE' },
          { label: 'Pendientes', href: '/whatsapp?view=PENDING' },
          { label: 'Renovaciones', href: '/whatsapp?view=RENEWALS' },
          { label: 'Cerradas', href: '/whatsapp?view=CLOSED' },
          { label: 'Archivadas', href: '/whatsapp?view=ARCHIVED' },
          { label: 'Papelera', href: '/whatsapp?view=TRASH' },
        ],
      },
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
  {
    label: 'Configuración',
    items: [
      {
        label: 'Canales',
        href: '/settings/integrations/whatsapp',
        icon: '⚑',
        permission: 'whatsapp.manage',
      },
    ],
  },
];

export function Sidebar(): React.ReactElement {
  const pathname = usePathname();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileOpen = useUiStore((state) => state.mobileSidebarOpen);
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const user = useAuthStore((state) => state.user);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);
  const canSee = (item: NavItem) => !item.permission || user?.permissions.includes(item.permission);
  return (
    <>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden h-dvh w-[min(86vw,280px)] flex-col overflow-y-auto border-r border-border-default bg-surface-card/95 px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur transition-[width] lg:flex',
          mobileOpen && 'flex',
          collapsed ? 'lg:w-[78px]' : 'lg:w-[260px]',
        )}
        aria-label="Barra lateral de navegación"
      >
        <button
          aria-label="Cerrar navegación"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-content-secondary hover:bg-surface-muted lg:hidden"
          onClick={() => setMobileOpen(false)}
          type="button"
        >
          ×
        </button>
        <div className={cn('flex items-center gap-3 px-3', collapsed && 'justify-center')}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-600 font-black text-white shadow-lg shadow-brand-600/20">
            S
          </div>
          {collapsed && !mobileOpen ? null : (
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
                  collapsed && !mobileOpen && 'text-center',
                )}
              >
                {collapsed && !mobileOpen ? '•••' : section.label}
              </p>
              <div className="space-y-1">
                {section.items.filter(canSee).map((item) => {
                  const active =
                    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  return (
                    <Fragment key={item.href}>
                      <Link
                        aria-label={item.label}
                        className={cn(
                          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                          active
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                            : 'text-content-secondary hover:bg-surface-muted hover:text-content-primary',
                          collapsed && !mobileOpen && 'justify-center px-2',
                        )}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        title={collapsed ? item.label : undefined}
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-lg text-base',
                            active
                              ? 'bg-surface-card/80'
                              : 'bg-surface-muted group-hover:bg-surface-card',
                          )}
                        >
                          {item.icon}
                        </span>
                        {collapsed && !mobileOpen ? null : <span>{item.label}</span>}
                      </Link>
                      {item.children && active && (!collapsed || mobileOpen) ? (
                        <div className="ml-10 mt-1 space-y-0.5 border-l border-border-subtle pl-3">
                          {item.children.map((child) => (
                            <Link
                              className="block truncate rounded-lg px-2 py-1.5 text-[11px] font-semibold text-content-muted hover:bg-surface-muted hover:text-content-primary"
                              href={child.href}
                              key={child.href}
                              onClick={() => setMobileOpen(false)}
                            >
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div
          className={cn(
            'absolute bottom-4 left-3 right-3 rounded-2xl bg-surface-muted p-3',
            collapsed && !mobileOpen && 'p-2',
          )}
        >
          <div
            className={cn('flex items-center gap-2', collapsed && !mobileOpen && 'justify-center')}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-content-primary text-xs font-bold text-surface-page">
              {user?.firstName.slice(0, 1).toUpperCase() ?? '?'}
            </div>
            {collapsed && !mobileOpen ? null : (
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
      {mobileOpen ? (
        <button
          aria-label="Cerrar menú de navegación"
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}
    </>
  );
}
