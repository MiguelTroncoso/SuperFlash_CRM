-- Revenue Intelligence Phase 1 is a read-only analytical layer.
-- It intentionally does not alter transactional tables or add business entities.

CREATE MATERIALIZED VIEW "revenue_sales_daily" AS
SELECT
  s."organizationId" AS organization_id,
  DATE_TRUNC('day', COALESCE(s."soldAt", s."createdAt") AT TIME ZONE 'UTC')::date AS metric_date,
  s."currency" AS currency,
  COALESCE(si."productId"::text, '') AS product_id,
  si."productNameSnapshot" AS product_name,
  COALESCE(c."country", '') AS country,
  COALESCE(s."userId"::text, '') AS seller_id,
  COALESCE(provider.provider_id, '') AS provider_id,
  COUNT(DISTINCT s."id")::integer AS sales_count,
  COUNT(DISTINCT s."contactId")::integer AS customer_count,
  SUM(si."total")::numeric(18,2) AS gross_revenue,
  SUM(CASE WHEN s.status = 'CANCELLED' THEN si."total" ELSE 0 END)::numeric(18,2) AS refund_amount,
  SUM(CASE WHEN s.status <> 'CANCELLED' THEN si."total" ELSE 0 END)::numeric(18,2) AS net_revenue
FROM "Sale" s
JOIN "SaleItem" si
  ON si."organizationId" = s."organizationId" AND si."saleId" = s."id"
JOIN "Contact" c
  ON c."organizationId" = s."organizationId" AND c."id" = s."contactId"
LEFT JOIN LATERAL (
  SELECT f."providerId"::text AS provider_id
  FROM "Fulfillment" f
  WHERE f."organizationId" = s."organizationId"
    AND f."saleId" = s."id"
    AND f."saleItemId" = si."id"
    AND f."deletedAt" IS NULL
  ORDER BY f."createdAt" ASC
  LIMIT 1
) provider ON true
WHERE s."deletedAt" IS NULL
  AND si."deletedAt" IS NULL
  AND s.status IN ('CONFIRMED', 'FULFILLED')
GROUP BY
  s."organizationId",
  DATE_TRUNC('day', COALESCE(s."soldAt", s."createdAt") AT TIME ZONE 'UTC')::date,
  s."currency",
  COALESCE(si."productId"::text, ''),
  si."productNameSnapshot",
  COALESCE(c."country", ''),
  COALESCE(s."userId"::text, ''),
  COALESCE(provider.provider_id, '')
WITH DATA;

CREATE UNIQUE INDEX "revenue_sales_daily_identity_idx"
  ON "revenue_sales_daily" (organization_id, metric_date, currency, product_id, country, seller_id, provider_id);
CREATE INDEX "revenue_sales_daily_date_idx"
  ON "revenue_sales_daily" (organization_id, metric_date);
CREATE INDEX "revenue_sales_daily_dimensions_idx"
  ON "revenue_sales_daily" (organization_id, country, seller_id, product_id, provider_id);

CREATE MATERIALIZED VIEW "revenue_subscriptions_monthly" AS
SELECT
  s."organizationId" AS organization_id,
  DATE_TRUNC('month', COALESCE(s."currentPeriodStart", s."startsAt") AT TIME ZONE 'UTC')::date AS metric_month,
  s."currency" AS currency,
  COALESCE(s."productId"::text, '') AS product_id,
  s."productNameSnapshot" AS product_name,
  COALESCE(c."country", '') AS country,
  COALESCE(s."userId"::text, '') AS seller_id,
  COUNT(*)::integer AS subscription_count,
  COUNT(*) FILTER (WHERE s.status = 'ACTIVE')::integer AS active_subscriptions,
  COUNT(*) FILTER (WHERE s.status IN ('EXPIRED', 'CANCELLED'))::integer AS churned_subscriptions,
  SUM(
    CASE s."billingCycle"
      WHEN 'WEEKLY' THEN s.amount * 52 / 12
      WHEN 'MONTHLY' THEN s.amount
      WHEN 'QUARTERLY' THEN s.amount / 3
      WHEN 'SEMI_ANNUAL' THEN s.amount / 6
      WHEN 'ANNUAL' THEN s.amount / 12
      WHEN 'CUSTOM' THEN s.amount * 30 / NULLIF(s."customIntervalDays", 0)
      ELSE 0
    END
  )::numeric(18,2) AS mrr
FROM "Subscription" s
JOIN "Contact" c
  ON c."organizationId" = s."organizationId" AND c."id" = s."contactId"
WHERE s."deletedAt" IS NULL
GROUP BY
  s."organizationId",
  DATE_TRUNC('month', COALESCE(s."currentPeriodStart", s."startsAt") AT TIME ZONE 'UTC')::date,
  s."currency",
  COALESCE(s."productId"::text, ''),
  s."productNameSnapshot",
  COALESCE(c."country", ''),
  COALESCE(s."userId"::text, '')
WITH DATA;

CREATE UNIQUE INDEX "revenue_subscriptions_monthly_identity_idx"
  ON "revenue_subscriptions_monthly" (organization_id, metric_month, currency, product_id, country, seller_id);
CREATE INDEX "revenue_subscriptions_monthly_date_idx"
  ON "revenue_subscriptions_monthly" (organization_id, metric_month);

CREATE MATERIALIZED VIEW "revenue_funnel_daily" AS
SELECT
  h."organizationId" AS organization_id,
  DATE_TRUNC('day', h."changedAt" AT TIME ZONE 'UTC')::date AS metric_date,
  COALESCE(ps."systemKey", ps."name") AS stage_key,
  ps."name" AS stage_name,
  COALESCE(o."userId"::text, '') AS seller_id,
  COALESCE(c."country", '') AS country,
  COALESCE(o."productId"::text, '') AS product_id,
  COUNT(DISTINCT h."opportunityId")::integer AS opportunity_count
FROM "OpportunityStageHistory" h
JOIN "Opportunity" o
  ON o."organizationId" = h."organizationId" AND o."id" = h."opportunityId"
JOIN "PipelineStage" ps
  ON ps."organizationId" = h."organizationId" AND ps."id" = h."toStageId"
JOIN "Contact" c
  ON c."organizationId" = o."organizationId" AND c."id" = o."contactId"
WHERE o."deletedAt" IS NULL
  AND h."changedAt" IS NOT NULL
GROUP BY
  h."organizationId",
  DATE_TRUNC('day', h."changedAt" AT TIME ZONE 'UTC')::date,
  COALESCE(ps."systemKey", ps."name"),
  ps."name",
  COALESCE(o."userId"::text, ''),
  COALESCE(c."country", ''),
  COALESCE(o."productId"::text, '')
WITH DATA;

CREATE UNIQUE INDEX "revenue_funnel_daily_identity_idx"
  ON "revenue_funnel_daily" (organization_id, metric_date, stage_key, seller_id, country, product_id);
CREATE INDEX "revenue_funnel_daily_date_idx"
  ON "revenue_funnel_daily" (organization_id, metric_date, stage_key);
