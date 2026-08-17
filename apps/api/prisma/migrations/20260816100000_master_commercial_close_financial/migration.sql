ALTER TABLE "Organization"
  ADD COLUMN "saleSequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Sale"
  ADD COLUMN "saleNumber" TEXT;

WITH numbered AS (
  SELECT
    "id",
    "organizationId",
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS sequence
  FROM "Sale"
  WHERE "saleNumber" IS NULL
), assigned AS (
  SELECT
    "id",
    'SF-' || TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || LPAD(sequence::TEXT, 6, '0') AS "saleNumber",
    sequence
  FROM numbered
)
UPDATE "Sale" AS sale
SET "saleNumber" = assigned."saleNumber"
FROM assigned
WHERE sale."id" = assigned."id";

WITH counters AS (
  SELECT "organizationId", COUNT(*)::INTEGER AS sequence
  FROM "Sale"
  GROUP BY "organizationId"
)
UPDATE "Organization" AS organization
SET "saleSequence" = counters.sequence
FROM counters
WHERE organization."id" = counters."organizationId";

ALTER TABLE "Sale"
  ALTER COLUMN "saleNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Sale_organizationId_saleNumber_key"
  ON "Sale" ("organizationId", "saleNumber");

CREATE TABLE "PaymentFeeConfig" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "percentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "fixedFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "internationalPercentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "conversionPercentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "PaymentFeeConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentFeeConfig_organizationId_id_key"
  ON "PaymentFeeConfig" ("organizationId", "id");

CREATE UNIQUE INDEX "PaymentFeeConfig_organizationId_method_key"
  ON "PaymentFeeConfig" ("organizationId", "method");

CREATE INDEX "PaymentFeeConfig_organizationId_active_idx"
  ON "PaymentFeeConfig" ("organizationId", "active");

CREATE INDEX "PaymentFeeConfig_createdAt_idx"
  ON "PaymentFeeConfig" ("createdAt");

ALTER TABLE "PaymentFeeConfig"
  ADD CONSTRAINT "PaymentFeeConfig_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_total_non_negative_check"
  CHECK ("total" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amounts_non_negative_check"
  CHECK ("grossAmount" >= 0 AND "feeAmount" >= 0 AND "netAmount" >= 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "netAmount");
