'use client';

import Link from 'next/link';

import { PageGrid, PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const settingsGroups = [
  {
    title: 'Canales',
    description: 'Configura y revisa los canales de comunicación sin exponer secretos.',
    links: [{ label: 'WhatsApp', href: '/settings/integrations/whatsapp' }],
  },
  {
    title: 'Administración comercial',
    description: 'Accede a información avanzada cuando la operación diaria lo requiera.',
    links: [
      { label: 'Base maestra de Contactos', href: '/contacts' },
      { label: 'Revenue Intelligence', href: '/revenue' },
      { label: 'Marketing y atribución', href: '/marketing' },
      { label: 'Finanzas', href: '/financial' },
    ],
  },
  {
    title: 'Operaciones',
    description: 'Proveedores, entrega, credenciales, trials y activaciones.',
    links: [
      { label: 'Providers', href: '/providers' },
      { label: 'Fulfillment', href: '/fulfillment' },
      { label: 'Credenciales', href: '/credentials' },
      { label: 'Trials y activaciones', href: '/trials' },
    ],
  },
  {
    title: 'Automatización',
    description: 'Herramientas avanzadas de comunicación y ejecución.',
    links: [
      { label: 'Automatizaciones', href: '/automations' },
      { label: 'Plantillas', href: '/templates' },
      { label: 'Notificaciones', href: '/notifications' },
    ],
  },
] as const;

export function SettingsPage(): React.ReactElement {
  return (
    <PageGrid>
      <PageHeader
        eyebrow="Administración"
        title="Configuración"
        description="La operación diaria permanece simple; las herramientas avanzadas viven aquí."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {settingsGroups.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {group.links.map((link) => (
                <Link
                  className="rounded-xl border border-border-subtle p-3 text-sm font-bold text-content-primary transition hover:border-brand-300 hover:bg-surface-muted"
                  href={link.href}
                  key={link.href}
                >
                  {link.label} →
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </PageGrid>
  );
}
