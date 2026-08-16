import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SalesPage } from '@/features/sales/sales-page';
import { api } from '@/lib/api-client';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe('Sales frontend contract', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the Sale contact name in the list and detail', async () => {
    jest.spyOn(api, 'getSales').mockResolvedValue({
      data: [
        {
          id: 'sale-agustin',
          status: 'CONFIRMED',
          currency: 'CLP',
          subtotal: '15000.00',
          discountAmount: '0.00',
          taxAmount: '0.00',
          total: '15000.00',
          contact: {
            id: 'contact-agustin',
            name: 'Agustin',
            firstName: 'Agustin',
            lastName: null,
            phone: '+56 9 7511 6332',
            email: null,
          },
          opportunity: null,
          seller: null,
          items: [],
          subscriptions: [],
          paymentDueAt: null,
          createdAt: '2026-08-15T00:00:00.000Z',
          updatedAt: '2026-08-15T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });
    jest.spyOn(api, 'getContacts').mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
    jest.spyOn(api, 'getOffers').mockResolvedValue({ data: [] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <SalesPage />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Agustin')).toBeInTheDocument());
    expect(screen.queryByText('Sin contacto')).not.toBeInTheDocument();
    screen.getByRole('button', { name: '#sale-agu' }).click();
    await waitFor(() => expect(screen.getAllByText('Agustin')).toHaveLength(2));
  });
});
