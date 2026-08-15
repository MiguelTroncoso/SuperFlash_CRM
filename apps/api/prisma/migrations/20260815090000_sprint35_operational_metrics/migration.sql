CREATE TYPE "DailyMetricSource" AS ENUM ('MANUAL', 'IMPORT');

CREATE TABLE "DailyMetric" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "metricDate" DATE NOT NULL,
  "campaignId" UUID,
  "campaignKey" TEXT NOT NULL DEFAULT '',
  "campaignNameSnapshot" TEXT,
  "country" TEXT NOT NULL,
  "conversations" INTEGER NOT NULL DEFAULT 0,
  "demos" INTEGER NOT NULL DEFAULT 0,
  "salesCount" INTEGER NOT NULL DEFAULT 0,
  "adSpend" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "grossRevenue" DECIMAL(18,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "notes" TEXT,
  "source" "DailyMetricSource" NOT NULL DEFAULT 'MANUAL',
  "createdByUserId" UUID,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyMetric_organizationId_id_key"
  ON "DailyMetric"("organizationId", "id");

CREATE UNIQUE INDEX "DailyMetric_organizationId_metricDate_campaignKey_country_key"
  ON "DailyMetric"("organizationId", "metricDate", "campaignKey", "country");

CREATE INDEX "DailyMetric_organizationId_metricDate_idx"
  ON "DailyMetric"("organizationId", "metricDate");

CREATE INDEX "DailyMetric_organizationId_campaignId_metricDate_idx"
  ON "DailyMetric"("organizationId", "campaignId", "metricDate");

CREATE INDEX "DailyMetric_organizationId_country_metricDate_idx"
  ON "DailyMetric"("organizationId", "country", "metricDate");

CREATE INDEX "DailyMetric_createdAt_idx"
  ON "DailyMetric"("createdAt");

ALTER TABLE "DailyMetric"
  ADD CONSTRAINT "DailyMetric_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DailyMetric"
  ADD CONSTRAINT "DailyMetric_organizationId_campaignId_fkey"
  FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DailyMetric"
  ADD CONSTRAINT "DailyMetric_organizationId_createdByUserId_fkey"
  FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "User"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DailyMetric"
  ADD CONSTRAINT "DailyMetric_organizationId_updatedByUserId_fkey"
  FOREIGN KEY ("organizationId", "updatedByUserId") REFERENCES "User"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DailyMetric"
  ADD CONSTRAINT "DailyMetric_non_negative_values_check"
  CHECK ("conversations" >= 0 AND "demos" >= 0 AND "salesCount" >= 0 AND "adSpend" >= 0 AND ("grossRevenue" IS NULL OR "grossRevenue" >= 0));

ALTER TABLE "DailyMetric"
  ADD CONSTRAINT "DailyMetric_country_currency_format_check"
  CHECK (("country" = 'GLOBAL' OR "country" ~ '^[A-Z]{2}$') AND "currency" ~ '^[A-Z]{3}$');
