import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { BusinessIntelligencePage } from '@/features/executive-intelligence/business-intelligence-page';
import { PipelineIntelligencePage } from '@/features/executive-intelligence/pipeline-intelligence-page';
import { CommandPalette } from '@/components/ui/command-palette';
import { api } from '@/lib/api-client';
import { useUiStore } from '@/lib/ui-store';

jest.mock('next/navigation', () => ({
  usePathname: () => '/business-intelligence',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

function withQuery(ui: React.ReactElement): React.ReactElement {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

describe('executive intelligence frontend', () => {
  beforeEach(() => {
    useUiStore.getState().setCommandOpen(false);
    jest.restoreAllMocks();
  });

  it('filters navigation commands from the Command Palette', () => {
    actOpenCommandPalette();
    render(withQuery(<CommandPalette />));
    fireEvent.change(screen.getByPlaceholderText('Buscar páginas, clientes, ventas…'), {
      target: { value: 'Agenda' },
    });
    expect(screen.getByRole('button', { name: /Agenda operativa/ })).toBeInTheDocument();
  });

  it('renders a persisted BI dimension with empty-safe fields', async () => {
    jest.spyOn(api, 'getBusinessIntelligence').mockResolvedValue({
      generatedAt: '2026-08-01T00:00:00.000Z',
      period: { from: '2026-07-01', to: '2026-08-01' },
      view: 'countries',
      data: [{ country: 'CL', leads: 4, sales: 2, revenue: 'USD 100.00' }],
    });
    render(withQuery(<BusinessIntelligencePage view="countries" />));
    await waitFor(() => expect(screen.getByText('CL')).toBeInTheDocument());
    expect(screen.getByText('2 ventas')).toBeInTheDocument();
  });

  it('renders advanced pipeline signals from the API', async () => {
    jest.spyOn(api, 'getPipelineIntelligence').mockResolvedValue({
      data: [
        {
          id: 'opp-1',
          title: 'Interés de Ana',
          expectedAmount: '100.00',
          currency: 'USD',
          probability: 80,
          priority: 'HIGH',
          ageDays: 12,
          daysInStage: 9,
          weightedValue: '80.00',
          stalled: true,
          createdAt: '2026-08-01T00:00:00.000Z',
          lastStageChangedAt: '2026-08-01T00:00:00.000Z',
          contact: { firstName: 'Ana', lastName: 'Lead' },
          pipelineStage: { name: 'Demo' },
          owner: null,
          product: null,
          campaign: null,
          nextFollowUp: null,
        },
      ],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });
    render(withQuery(<PipelineIntelligencePage />));
    await waitFor(() => expect(screen.getByText('Interés de Ana')).toBeInTheDocument());
    expect(screen.getByText('Estancada')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });
});

function actOpenCommandPalette(): void {
  useUiStore.getState().setCommandOpen(true);
}
