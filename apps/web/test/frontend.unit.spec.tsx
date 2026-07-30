import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { KanbanBoard } from '@/components/ui/kanban-board';
import { PermissionGate } from '@/components/ui/permission-gate';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { useAuthStore } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';
import { api } from '@/lib/api-client';
import { ExecutiveDashboardPage } from '@/features/revenue-intelligence/revenue-pages';
import { WhatsAppPage } from '@/features/whatsapp/whatsapp-page';
import { CountryPhoneField } from '@/components/shared/country-phone-field';
import { COUNTRIES, phoneMatchesCountry } from '@superflash/utils';
import type { AuthUser, RevenueDashboard } from '@/lib/types';
import type { ColumnDef } from '@tanstack/react-table';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

interface Row {
  id: string;
  name: string;
}
const columns: ColumnDef<Row, unknown>[] = [{ accessorKey: 'name', header: 'Nombre' }];
const user: AuthUser = {
  id: 'user-1',
  email: 'owner@example.com',
  firstName: 'Miguel',
  lastName: 'Owner',
  phone: null,
  timezone: 'America/Santiago',
  organization: { id: 'org-1', name: 'Demo', slug: 'demo' },
  role: { id: 'role-1', name: 'Owner' },
  permissions: ['credentials.read', 'credentials.reveal'],
};

describe('frontend foundation', () => {
  beforeEach(() => {
    act(() => useAuthStore.getState().setSession('memory-token', user));
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the main navigation header and user workspace', () => {
    render(<Header />);
    expect(screen.getByText('SuperFlash')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de usuario' }));
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText('Mi perfil')).toBeInTheDocument();
    expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
  });

  it('keeps the avatar menu interactive for touch and keyboard dismissal', () => {
    render(<Header />);
    const avatar = screen.getByRole('button', { name: 'Abrir menú de usuario' });
    fireEvent.click(avatar);
    expect(screen.getByRole('menu', { name: 'Menú de usuario' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu', { name: 'Menú de usuario' })).not.toBeInTheDocument();
    fireEvent.click(avatar);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Menú de usuario' })).not.toBeInTheDocument();
  });

  it('renders DataTable rows and its empty state', () => {
    const { rerender } = render(
      <DataTable columns={columns} data={[{ id: '1', name: 'Lead Demo' }]} />,
    );
    expect(screen.getByText('Lead Demo')).toBeInTheDocument();
    rerender(
      <DataTable
        columns={columns}
        data={[]}
        emptyTitle="Sin contactos"
        emptyDescription="Crea uno"
      />,
    );
    expect(screen.getByText('Sin contactos')).toBeInTheDocument();
  });

  it('opens and closes the reusable Drawer', () => {
    const onClose = jest.fn();
    render(
      <Drawer open onClose={onClose} title="Editar lead">
        Contenido
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Editar lead' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([360, 390, 412, 768])('keeps compact shell controls available at %ipx', (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    render(<Header />);
    expect(screen.getByRole('banner')).toHaveClass('safe-area-top');
    expect(screen.getByRole('button', { name: 'Abrir menú de usuario' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar tema' })).toBeInTheDocument();
  });

  it('enforces PermissionGate for credential reveal', () => {
    render(
      <PermissionGate permission="credentials.reveal">
        <span>Reveal autorizado</span>
      </PermissionGate>,
    );
    expect(screen.getByText('Reveal autorizado')).toBeInTheDocument();
    act(() =>
      useAuthStore
        .getState()
        .setSession('memory-token', { ...user, permissions: ['credentials.read'] }),
    );
    render(
      <PermissionGate fallback={<span>Reveal bloqueado</span>} permission="credentials.reveal">
        <span>Reveal autorizado</span>
      </PermissionGate>,
    );
    expect(screen.getByText('Reveal bloqueado')).toBeInTheDocument();
  });

  it('renders Kanban columns and cards for pipeline navigation', () => {
    render(
      <KanbanBoard
        columns={[
          {
            id: 'stage-1',
            title: 'Nuevo Lead',
            color: '#6366f1',
            items: [{ id: 'opp-1', title: 'Interés de Juan', subtitle: 'Juan Pérez' }],
          },
        ]}
      />,
    );
    expect(screen.getByText('Nuevo Lead')).toBeInTheDocument();
    expect(screen.getByText('Interés de Juan')).toBeInTheDocument();
  });

  it('toggles dark mode without persisting secrets', () => {
    useUiStore.getState().toggleTheme();
    expect(document.documentElement).toHaveClass('dark');
    expect(useAuthStore.getState().accessToken).toBe('memory-token');
  });

  it('persists light, dark and system theme preferences', () => {
    useUiStore.getState().setTheme('system');
    expect(window.localStorage.getItem('superflash-theme')).toBe('system');
    expect(document.documentElement).not.toHaveClass('dark');
    useUiStore.getState().setTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
    useUiStore.getState().setTheme('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('opens the mobile sidebar as a drawer and closes it through the overlay', () => {
    render(<Sidebar />);
    act(() => useUiStore.getState().setMobileSidebarOpen(true));
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('complementary', { name: 'Barra lateral de navegación' })).toHaveClass(
      'flex',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar menú de navegación' }));
    expect(useUiStore.getState().mobileSidebarOpen).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('uses the shared ten-country catalog and detects prefix mismatch', () => {
    expect(COUNTRIES).toHaveLength(10);
    expect(COUNTRIES.find((country) => country.code === 'CL')?.dialCode).toBe('+56');
    expect(phoneMatchesCountry('+56912345678', 'CL')).toBe(true);
    expect(phoneMatchesCountry('+573001234567', 'CL')).toBe(false);
  });

  it('renders the country selector and preserves the visible phone input', () => {
    const onCountryChange = jest.fn();
    const onPhoneChange = jest.fn();
    render(
      <CountryPhoneField
        country="CL"
        onCountryChange={onCountryChange}
        onPhoneChange={onPhoneChange}
        phone="9 1234 5678"
      />,
    );
    expect(screen.getByText(/Chile/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('País'), { target: { value: 'MX' } });
    fireEvent.change(screen.getByLabelText(/Teléfono/), { target: { value: '55 1234 5678' } });
    expect(onCountryChange).toHaveBeenCalledWith('MX');
    expect(onPhoneChange).toHaveBeenCalledWith('55 1234 5678');
  });

  it('sends credential reveal through the authorized backend path', async () => {
    const response = {
      ok: true,
      status: 200,
      json: async () => ({ id: 'credential-1', username: 'demo' }),
    } as Response;
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(response);
    globalThis.fetch = fetchMock;
    await api.revealCredential('credential-1');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/credentials/credential-1/reveal'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('renders the executive revenue dashboard from the backend contract', async () => {
    const dashboard: RevenueDashboard = {
      generatedAt: '2026-07-28T00:00:00.000Z',
      filters: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-28T00:00:00.000Z' },
      kpis: {
        salesToday: [{ currency: 'USD', amount: '100.00', count: 1 }],
        salesMonth: [{ currency: 'USD', amount: '100.00', count: 1 }],
        mrr: [],
        arr: [],
        newCustomers: 1,
        activeCustomers: 1,
        lostCustomers: 0,
        averageTimeToSaleDays: 2,
        averageActivationDays: 0,
        averageCloseDays: 2,
        successfulRenewals: 0,
        churnRate: 0,
        trialToSaleRate: 0,
        averageTicket: [{ currency: 'USD', amount: '100.00', count: 1 }],
        ltvBasic: [{ currency: 'USD', amount: '10000.00', count: 1 }],
        conversionByStage: [],
        conversionBySeller: [],
        conversionByCountry: [],
      },
      trends: [{ date: '2026-07-28', currency: 'USD', revenue: '100.00', sales: 1, customers: 1 }],
      funnel: {
        name: 'Commercial Core',
        stages: [{ key: 'SALE', label: 'Venta', count: 1, conversionRate: 100 }],
      },
      forecast: [],
      communication: {
        generatedAt: '2026-07-28T00:00:00.000Z',
        period: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-28T00:00:00.000Z' },
        conversationsToday: 2,
        conversationsByCountry: [{ country: 'CL', conversations: 2 }],
        messagesToday: 3,
        messagesThisWeek: 5,
        messagesThisMonth: 10,
        newContacts: 1,
        activeCustomers: 1,
        inactiveCustomers: 0,
        minutesSinceLastMessage: 4,
        topCountry: { country: 'CL', conversations: 2 },
        topContact: { contactId: 'contact-1', name: 'Juan Pérez', messages: 3 },
        topConversations: [],
        activityByHour: [],
        activityByDay: [],
        activityByMonth: [],
      },
    };
    jest.spyOn(api, 'getRevenueDashboard').mockResolvedValue(dashboard);
    jest.spyOn(api, 'getContactAssignees').mockResolvedValue([]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutiveDashboardPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Dashboard ejecutivo')).toBeInTheDocument();
    expect((await screen.findAllByText('USD 100')).length).toBeGreaterThan(0);
    expect(screen.getByText('Venta')).toBeInTheDocument();
    expect(screen.getByText('Actividad de WhatsApp Read Only')).toBeInTheDocument();
    expect(screen.getByLabelText('País')).toBeInTheDocument();
    expect(screen.getByLabelText('Moneda')).toBeInTheDocument();
    expect(screen.getByLabelText('Vendedor')).toBeInTheDocument();
  });

  it('renders the WhatsApp read-only connector without write controls or secrets', async () => {
    jest.spyOn(api, 'getWhatsAppReadOnlyHealth').mockResolvedValue({
      channel: 'WHATSAPP_READ_ONLY',
      provider: 'PERSISTED_WEBHOOK_READ_MODEL',
      status: 'CONNECTED',
      readOnly: true,
      externalWriteEnabled: false,
      externalRequestMade: false,
      source: 'LOCAL_WHATSAPP_READ_MODEL',
      lastWebhookReceivedAt: null,
      checkpoint: null,
      totals: { messages: 3, conversations: 1 },
      metrics: {},
    });
    jest.spyOn(api, 'getWhatsAppReadOnlySyncStatus').mockResolvedValue({
      status: 'SUCCEEDED',
      checkpoint: { at: null, id: null },
      lastSynchronizedAt: null,
      lastSuccessfulAt: null,
      messagesImported: 3,
      conversationsImported: 1,
      contactsImported: 1,
      duplicatesAvoided: 0,
      errors: 0,
      nextRetryAt: null,
      lastError: null,
      readOnly: true,
      externalWriteEnabled: false,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <WhatsAppPage settingsOnly />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('WhatsApp Read Only')).toBeInTheDocument();
    expect(screen.getByText('Solo lectura')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sincronizar ahora' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar|responder/i })).not.toBeInTheDocument();
  });
});
