# Revenue Intelligence — Phase 1

## Boundary

Architecture v2.0 Phase 1 is a read-only analytical layer over the operational
Commercial Core. It consumes Sales, Payments, Subscriptions, Renewals, Trials,
Activations, Opportunities, Contacts and Providers. It does not mutate those
domains, create external integrations or become a source of transactional
truth.

All API reads are scoped from the authenticated organization and require
`reports.read`. `organizationId` is never accepted from the client or returned
as analytical payload data.

## API

All endpoints use the `/api/v1/revenue-intelligence` prefix:

- `GET /dashboard` — executive composition of KPIs, trends, funnel and forecast.
- `GET /kpis` — commercial metrics and conversion breakdowns.
- `GET /funnels` — configurable stages; use `stages=MESSAGE,SALE` and
  `compare=true` to compare the previous period.
- `GET /cohorts` — monthly retention cohorts and revenue.
- `GET /trends` — daily revenue, sales and customers.
- `GET /forecast` — historical trend forecast with `horizon=1..12`.
- `GET /materialized-views/status` — operational status of analytical views.

Common filters are `from`, `to`, `country`, `currency`, `sellerId`, `productId`
and `providerId`. UUID filters are validated by the API. Dates are interpreted
in UTC for reproducible aggregation.

## Read warehouse layer

Migration `20260805100000_revenue_intelligence_read_layer` creates three
PostgreSQL materialized views without changing transactional tables:

- `revenue_sales_daily` — daily sales, customer and revenue aggregates with
  product, country, seller and provider dimensions.
- `revenue_subscriptions_monthly` — monthly subscription count, active/churned
  counts and normalized MRR.
- `revenue_funnel_daily` — daily opportunity stage transitions.

Each view has a tenant-aware identity index and dimension indexes. Refresh is
prepared for concurrent execution:

```bash
npm run db:refresh-revenue-views
```

The refresh command only rebuilds derived read data. It does not update
customers, sales or any other transactional row. KPI and trend queries fall
back to live operational reads when a view has not yet been populated, so a
new tenant is immediately observable while scheduled refresh is being adopted.
An incremental refresh schedule can be added later without changing the API
contract.

## Dashboard

The frontend executive dashboard is available at `/` and `/revenue`. Supporting
views are `/revenue/kpis`, `/revenue/funnels`, `/revenue/cohorts`,
`/revenue/trends` and `/revenue/forecast`. They use React Query and render
loading, error and empty states through shared UI components.

## Limitations and next phase

Phase 1 uses only existing first-party data. Attribution, MarketingSpend,
external ad connectors, AI recommendations and an Analytical Event Store remain
roadmap capabilities. Multi-currency conversion is intentionally not performed;
metrics are grouped by currency.
