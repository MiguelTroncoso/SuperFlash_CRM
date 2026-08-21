-- AlterTable Expense
ALTER TABLE "Expense"
  ADD COLUMN "exchangeRateToUsd" DECIMAL(18,8),
  ADD COLUMN "exchangeRateProvider" TEXT,
  ADD COLUMN "exchangeRateCapturedAt" TIMESTAMP(3),
  ADD COLUMN "usdAmount" DECIMAL(14,2);

-- CreateTable ExchangeRate
CREATE TABLE "ExchangeRate" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "fromCurrency" TEXT NOT NULL,
  "toCurrency" TEXT NOT NULL DEFAULT 'USD',
  "rate" DECIMAL(18,8) NOT NULL,
  "provider" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'AUTO',
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable CountryConfig
CREATE TABLE "CountryConfig" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "countryCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "dialCode" TEXT NOT NULL,
  "flag" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CountryConfig_pkey" PRIMARY KEY ("id")
);

-- Indexes for ExchangeRate
CREATE UNIQUE INDEX "ExchangeRate_organizationId_id_key" ON "ExchangeRate"("organizationId", "id");
CREATE UNIQUE INDEX "ExchangeRate_organizationId_fromCurrency_toCurrency_key" ON "ExchangeRate"("organizationId", "fromCurrency", "toCurrency");
CREATE INDEX "ExchangeRate_organizationId_active_idx" ON "ExchangeRate"("organizationId", "active");
CREATE INDEX "ExchangeRate_fromCurrency_toCurrency_idx" ON "ExchangeRate"("fromCurrency", "toCurrency");
CREATE INDEX "ExchangeRate_capturedAt_idx" ON "ExchangeRate"("capturedAt");

-- Indexes for CountryConfig
CREATE UNIQUE INDEX "CountryConfig_organizationId_id_key" ON "CountryConfig"("organizationId", "id");
CREATE UNIQUE INDEX "CountryConfig_organizationId_countryCode_key" ON "CountryConfig"("organizationId", "countryCode");
CREATE INDEX "CountryConfig_organizationId_active_sortOrder_idx" ON "CountryConfig"("organizationId", "active", "sortOrder");

-- Foreign Keys
ALTER TABLE "ExchangeRate"
  ADD CONSTRAINT "ExchangeRate_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CountryConfig"
  ADD CONSTRAINT "CountryConfig_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
