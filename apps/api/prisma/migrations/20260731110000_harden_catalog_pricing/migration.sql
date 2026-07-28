-- Sprint 7.1: enforce the limits and uniqueness semantics used by pricing.
-- This migration is intentionally additive/forward-only and does not modify
-- any previously approved migration.

ALTER TABLE "PriceBook"
DROP CONSTRAINT IF EXISTS "PriceBook_priority_nonnegative_chk";

ALTER TABLE "PriceBook"
ADD CONSTRAINT "PriceBook_priority_range_chk"
CHECK ("priority" BETWEEN -10000 AND 10000);

-- The valid period is part of the active-entry identity. PostgreSQL 16's
-- NULLS NOT DISTINCT makes two open-ended periods comparable for uniqueness.
DROP INDEX IF EXISTS "PriceBookEntry_active_combination_key";

CREATE UNIQUE INDEX "PriceBookEntry_active_combination_validity_key"
ON "PriceBookEntry" (
  "organizationId",
  "priceBookId",
  "productId",
  COALESCE("planId", '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE("variantId", '00000000-0000-0000-0000-000000000000'::uuid),
  "validFrom",
  "validUntil"
) NULLS NOT DISTINCT
WHERE "deletedAt" IS NULL AND "active" = true;

CREATE INDEX "PriceBook_resolution_candidates_idx"
ON "PriceBook" (
  "organizationId",
  "currency",
  "customerSegment",
  "countryCode",
  "isDefault",
  "priority" DESC,
  "createdAt" DESC,
  "id"
)
WHERE "status" = 'ACTIVE' AND "archivedAt" IS NULL AND "deletedAt" IS NULL;

CREATE INDEX "PriceBookEntry_resolution_candidates_idx"
ON "PriceBookEntry" (
  "organizationId",
  "priceBookId",
  "productId",
  "planId",
  "variantId",
  "validFrom",
  "validUntil",
  "createdAt",
  "id"
)
WHERE "active" = true AND "deletedAt" IS NULL;
