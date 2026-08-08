import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { LeadIntakeDrawer } from '@/features/leads/lead-intake-drawer';
import { api } from '@/lib/api-client';

function renderDrawer(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LeadIntakeDrawer onClose={jest.fn()} open />
    </QueryClientProvider>,
  );
}

describe('commercial lead intake frontend', () => {
  beforeEach(() => {
    jest.spyOn(api, 'getCategories').mockResolvedValue([]);
    jest.spyOn(api, 'getProducts').mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    jest.spyOn(api, 'getContactAssignees').mockResolvedValue([]);
    jest.spyOn(api, 'getMarketingCampaigns').mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('submits a phone-only lead through the transactional lead endpoint', async () => {
    const createLead = jest.spyOn(api, 'createLead').mockResolvedValue({
      contactId: 'contact-1',
      opportunityId: 'opportunity-1',
      reusedContact: false,
    });
    renderDrawer();
    fireEvent.change(await screen.findByPlaceholderText('+56912345678'), {
      target: { value: '+56912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear lead' }));
    await waitFor(() =>
      expect(createLead).toHaveBeenCalledWith(expect.objectContaining({ phone: '+56912345678' })),
    );
  });

  it('exposes inline category creation from the lead drawer', async () => {
    jest.spyOn(api, 'createCategory').mockResolvedValue({
      id: 'category-1',
      name: 'Reseller',
      slug: 'reseller',
      description: null,
      active: true,
      order: 1,
      archivedAt: null,
    });
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: '＋ Nueva categoría' }));
    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Reseller' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    await waitFor(() => expect(api.createCategory).toHaveBeenCalledWith({ name: 'Reseller' }));
  });
});
