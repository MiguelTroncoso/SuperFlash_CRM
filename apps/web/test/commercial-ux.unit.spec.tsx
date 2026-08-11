import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { LeadIntakeDrawer } from '@/features/leads/lead-intake-drawer';
import { CatalogPage } from '@/features/catalog/catalog-page';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

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
    jest.spyOn(api, 'getPipeline').mockResolvedValue({
      stages: [],
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
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Lead' }));
    await waitFor(() =>
      expect(createLead).toHaveBeenCalledWith(expect.objectContaining({ phone: '+56912345678' })),
    );
  });

  it('exposes inline category creation from the lead drawer', async () => {
    jest.spyOn(api, 'createCategoryQuick').mockResolvedValue({
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
    await waitFor(() => expect(api.createCategoryQuick).toHaveBeenCalledWith({ name: 'Reseller' }));
  });

  it('creates and selects a category inline without leaving the new product drawer', async () => {
    useAuthStore.getState().setSession('catalog-test-token', {
      id: 'user-1',
      email: 'owner@example.com',
      firstName: 'Owner',
      lastName: 'Test',
      phone: null,
      timezone: 'America/Santiago',
      organization: { id: 'org-1', name: 'Demo', slug: 'demo' },
      role: { id: 'role-1', name: 'Owner' },
      permissions: ['catalog.create', 'catalog.read', 'catalog.update', 'catalog.delete'],
    });
    const category = {
      id: 'category-1',
      name: 'IA',
      slug: 'ia',
      description: null,
      active: true,
      order: 1,
      archivedAt: null,
    };
    jest.spyOn(api, 'createCategoryQuick').mockResolvedValue(category);
    jest.spyOn(api, 'createProduct').mockResolvedValue({ id: 'product-1' } as never);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CatalogPage />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '＋ Nuevo producto' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'ChatGPT Plus' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), {
      target: { value: 'IA' },
    });
    fireEvent.click(await screen.findByRole('button', { name: '＋ Crear categoría “IA”' }));
    await waitFor(() => expect(api.createCategoryQuick).toHaveBeenCalledWith({ name: 'IA' }));
    expect(screen.getByDisplayValue('ChatGPT Plus')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'chatgpt-test' } });
    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'CLP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    await waitFor(() =>
      expect(api.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ChatGPT Plus',
          sku: 'chatgpt-test',
          currency: 'CLP',
          categoryId: 'category-1',
          type: 'OTHER',
          fulfillmentMode: 'MANUAL',
        }),
      ),
    );
  });
});
