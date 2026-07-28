'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { PageHeader, PageGrid } from '@/components/shared/page-header';
import { QueryState } from '@/components/shared/query-state';
import { SectionTitle } from '@/components/shared/section-title';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchBar } from '@/components/ui/search-bar';
import { StatusBadge } from '@/components/ui/badge';
import { api, queryString } from '@/lib/api-client';
import type { ProductOffer } from '@/lib/types';

export function CatalogPage(): React.ReactElement {
  const [search, setSearch] = useState('');
  const offers = useQuery({
    queryKey: ['catalog', 'offers', search],
    queryFn: () =>
      api.getOffers(queryString({ search, customerSegment: 'END_CUSTOMER', currency: 'USD' })),
  });
  return (
    <QueryState
      isError={offers.isError}
      isLoading={offers.isLoading}
      onRetry={() => void offers.refetch()}
    >
      <PageGrid>
        <PageHeader
          eyebrow="Catalog & pricing"
          title="Catálogo"
          description="Explora las ofertas vigentes que el backend permite comercializar."
          actions={
            <Button onClick={() => setSearch('')} variant="outline">
              Limpiar filtros
            </Button>
          }
        />
        <SearchBar
          className="max-w-sm"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar producto o SKU"
          value={search}
        />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {(offers.data?.data ?? []).map((product: ProductOffer) => (
            <Card className="overflow-hidden" key={product.id}>
              <div className="h-2 bg-gradient-to-r from-brand-500 to-violet-500" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">
                      {product.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{product.sku ?? product.slug}</p>
                  </div>
                  <StatusBadge status="ACTIVE" />
                </div>
                <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-500">
                  {product.description ?? 'Oferta disponible para tu operación comercial.'}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                    <p className="text-slate-400">Tipo</p>
                    <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
                      {product.type}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                    <p className="text-slate-400">Entrega</p>
                    <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
                      {product.fulfillmentMode}
                    </p>
                  </div>
                </div>
                <SectionTitle
                  action={null}
                  detail={`${product.plans.length} planes disponibles`}
                  title="Oferta"
                />
              </div>
            </Card>
          ))}
          {offers.data?.data.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState
                description="Las ofertas activas y con precio vigente aparecerán aquí."
                title="Catálogo vacío"
              />
            </div>
          ) : null}
        </div>
      </PageGrid>
    </QueryState>
  );
}
