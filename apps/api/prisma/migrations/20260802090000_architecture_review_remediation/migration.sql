-- Commercial Core hardening. Previous migrations remain immutable.

CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

ALTER TABLE "Activity" ADD COLUMN "requestId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "requestId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "snapshotVersion" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Payment" ADD COLUMN "requestFingerprint" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "snapshotVersion" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "Renewal"
  ADD COLUMN "customIntervalDays" INTEGER,
  ADD COLUMN "periodStart" TIMESTAMP(3),
  ADD COLUMN "periodEnd" TIMESTAMP(3),
  ADD COLUMN "cycleKey" TEXT,
  ADD COLUMN "snapshotVersion" INTEGER NOT NULL DEFAULT 2;

WITH ranked AS (
  SELECT
    renewal."id",
    renewal."subscriptionId",
    renewal."dueAt",
    COALESCE(subscription."currentPeriodEnd", subscription."nextBillingAt", subscription."startsAt", renewal."dueAt") AS "derivedPeriodStart",
    ROW_NUMBER() OVER (
      PARTITION BY renewal."organizationId", renewal."subscriptionId", renewal."dueAt"
      ORDER BY renewal."createdAt", renewal."id"
    ) AS duplicate_rank
  FROM "Renewal" AS renewal
  JOIN "Subscription" AS subscription
    ON subscription."organizationId" = renewal."organizationId"
   AND subscription."id" = renewal."subscriptionId"
)
UPDATE "Renewal" AS renewal
SET
  "periodStart" = ranked."derivedPeriodStart",
  "periodEnd" = GREATEST(
    ranked."dueAt",
    ranked."derivedPeriodStart" + INTERVAL '1 millisecond'
  ),
  "cycleKey" = ranked."subscriptionId"::text || ':' ||
    to_char(ranked."derivedPeriodStart" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ||
    CASE WHEN ranked.duplicate_rank = 1 THEN '' ELSE ':' || ranked.duplicate_rank::text END
FROM ranked
WHERE renewal."id" = ranked."id";

ALTER TABLE "Renewal"
  ALTER COLUMN "periodStart" SET NOT NULL,
  ALTER COLUMN "periodEnd" SET NOT NULL,
  ALTER COLUMN "cycleKey" SET NOT NULL;

CREATE UNIQUE INDEX "Renewal_organizationId_subscriptionId_cycleKey_key"
  ON "Renewal" ("organizationId", "subscriptionId", "cycleKey");

CREATE TABLE "OutboxEvent" (
  "id" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "organizationId" UUID NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" UUID NOT NULL,
  "actorId" UUID,
  "requestId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboxEvent_organizationId_id_key"
  ON "OutboxEvent" ("organizationId", "id");
CREATE INDEX "OutboxEvent_status_availableAt_idx"
  ON "OutboxEvent" ("status", "availableAt");
CREATE INDEX "OutboxEvent_organizationId_aggregateType_aggregateId_idx"
  ON "OutboxEvent" ("organizationId", "aggregateType", "aggregateId");
CREATE INDEX "OutboxEvent_requestId_idx" ON "OutboxEvent" ("requestId");
CREATE INDEX "OutboxEvent_createdAt_idx" ON "OutboxEvent" ("createdAt");

ALTER TABLE "OutboxEvent"
  ADD CONSTRAINT "OutboxEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OutboxEvent_organizationId_actorId_fkey"
  FOREIGN KEY ("organizationId", "actorId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_amounts_non_negative_chk"
  CHECK ("subtotal" >= 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0 AND "total" >= 0),
  ADD CONSTRAINT "Sale_total_formula_chk"
  CHECK ("total" = ROUND(("subtotal" - "discountAmount" + "taxAmount")::numeric, 2));

ALTER TABLE "SaleItem"
  ADD CONSTRAINT "SaleItem_amounts_non_negative_chk"
  CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0 AND "total" >= 0),
  ADD CONSTRAINT "SaleItem_total_formula_chk"
  CHECK ("total" = ROUND(("quantity" * "unitPrice" - "discountAmount" + "taxAmount")::numeric, 2));

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amounts_non_negative_chk"
  CHECK ("grossAmount" >= 0 AND "feeAmount" >= 0 AND "netAmount" >= 0 AND "refundedAmount" >= 0),
  ADD CONSTRAINT "Payment_fee_lte_gross_chk" CHECK ("feeAmount" <= "grossAmount"),
  ADD CONSTRAINT "Payment_refunded_lte_net_chk" CHECK ("refundedAmount" <= "netAmount"),
  ADD CONSTRAINT "Payment_net_formula_chk"
  CHECK ("netAmount" = ROUND(("grossAmount" - "feeAmount")::numeric, 2));

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_amount_non_negative_chk" CHECK ("amount" >= 0 AND "quantity" > 0);

ALTER TABLE "Renewal"
  ADD CONSTRAINT "Renewal_amount_non_negative_chk" CHECK ("amount" >= 0),
  ADD CONSTRAINT "Renewal_period_order_chk" CHECK ("periodEnd" > "periodStart");

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_custom_interval_chk"
  CHECK ("billingCycle" <> 'CUSTOM' OR ("customIntervalDays" IS NOT NULL AND "customIntervalDays" > 0));

ALTER TABLE "Renewal"
  ADD CONSTRAINT "Renewal_custom_interval_chk"
  CHECK ("billingCycle" <> 'CUSTOM' OR ("customIntervalDays" IS NOT NULL AND "customIntervalDays" > 0));

CREATE OR REPLACE FUNCTION superflash_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('superflash.allow_integrity_cleanup', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE TRIGGER "AuditLog_append_only_guard"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION superflash_append_only_guard();

CREATE TRIGGER "Activity_append_only_guard"
  BEFORE UPDATE OR DELETE ON "Activity"
  FOR EACH ROW EXECUTE FUNCTION superflash_append_only_guard();

CREATE OR REPLACE FUNCTION superflash_sale_item_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_status "SaleStatus";
BEGIN
  SELECT "status" INTO current_status
  FROM "Sale"
  WHERE "organizationId" = OLD."organizationId" AND "id" = OLD."saleId";

  IF current_status IN ('CONFIRMED', 'FULFILLED') THEN
    RAISE EXCEPTION 'SaleItem snapshots are immutable after sale confirmation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "SaleItem_immutable_after_confirmation"
  BEFORE UPDATE ON "SaleItem"
  FOR EACH ROW EXECUTE FUNCTION superflash_sale_item_immutable_guard();
