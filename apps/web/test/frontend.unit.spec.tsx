import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { KanbanBoard } from '@/components/ui/kanban-board';
import { PermissionGate } from '@/components/ui/permission-gate';
import { Header } from '@/components/layout/header';
import { useAuthStore } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';
import { api } from '@/lib/api-client';
import { ExecutiveDashboardPage } from '@/features/revenue-intelligence/revenue-pages';
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
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();
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
    };
    jest.spyOn(api, 'getRevenueDashboard').mockResolvedValue(dashboard);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutiveDashboardPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Dashboard ejecutivo')).toBeInTheDocument();
    expect((await screen.findAllByText('USD 100')).length).toBeGreaterThan(0);
    expect(screen.getByText('Venta')).toBeInTheDocument();
  });
});
