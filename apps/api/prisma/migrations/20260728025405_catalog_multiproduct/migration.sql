/*
  Warnings:

  - Product slugs are backfilled below before the column becomes required.

*/
-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('SUBSCRIPTION', 'CREDIT_PACKAGE', 'LICENSE', 'SERVICE', 'DIGITAL_ACCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "FulfillmentMode" AS ENUM ('MANUAL', 'API', 'INVITATION', 'CREDENTIALS', 'DOWNLOAD', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomerSegment" AS ENUM ('END_CUSTOMER', 'RESELLER', 'SUPER_RESELLER', 'ADMIN', 'BUSINESS', 'ANY');

-- CreateEnum
CREATE TYPE "BillingPeriodUnit" AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "PriceBookStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "allowsDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "categoryId" UUID,
ADD COLUMN     "demoDurationHours" INTEGER,
ADD COLUMN     "fulfillmentMode" "FulfillmentMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "requiresCustomerEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresCustomerPhone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresSubscription" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "type" "ProductType" NOT NULL DEFAULT 'OTHER',
ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "price" SET DEFAULT 0,
ALTER COLUMN "currency" DROP NOT NULL,
ALTER COLUMN "currency" SET DEFAULT 'USD',
ALTER COLUMN "active" SET DEFAULT true;

-- Backfill legacy products before enforcing the catalog slug contract.
UPDATE "Product"
SET "slug" = COALESCE(NULLIF(regexp_replace(lower(trim("name")), '[^a-z0-9]+', '-', 'g'), ''), 'product') || '-' || replace("id"::text, '-', '')
WHERE "slug" IS NULL;

ALTER TABLE "Product" ALTER COLUMN "slug" SET NOT NULL;

-- Keep legacy active products visible in the catalog after migration.
UPDATE "Product" SET "status" = 'ACTIVE' WHERE "active" = true AND "deletedAt" IS NULL;

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPlan" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "customerSegment" "CustomerSegment" NOT NULL,
    "billingPeriodUnit" "BillingPeriodUnit" NOT NULL,
    "billingPeriodCount" INTEGER NOT NULL DEFAULT 1,
    "quantity" DECIMAL(18,3),
    "deviceLimit" INTEGER,
    "creditAmount" DECIMAL(18,3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "planId" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "attributes" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBook" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PriceBookStatus" NOT NULL,
    "customerSegment" "CustomerSegment" NOT NULL,
    "countryCode" TEXT,
    "currency" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PriceBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookEntry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "priceBookId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "planId" UUID,
    "variantId" UUID,
    "salePrice" DECIMAL(18,2) NOT NULL,
    "costPrice" DECIMAL(18,2),
    "minimumPrice" DECIMAL(18,2),
    "taxIncluded" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PriceBookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "priceBookEntryId" UUID NOT NULL,
    "changedByUserId" UUID,
    "previousSalePrice" DECIMAL(18,2),
    "newSalePrice" DECIMAL(18,2),
    "previousCostPrice" DECIMAL(18,2),
    "newCostPrice" DECIMAL(18,2),
    "previousMinimumPrice" DECIMAL(18,2),
    "newMinimumPrice" DECIMAL(18,2),
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCategory_organizationId_idx" ON "ProductCategory"("organizationId");

-- CreateIndex
CREATE INDEX "ProductCategory_organizationId_slug_idx" ON "ProductCategory"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ProductCategory_organizationId_order_idx" ON "ProductCategory"("organizationId", "order");

-- CreateIndex
CREATE INDEX "ProductCategory_active_idx" ON "ProductCategory"("active");

-- CreateIndex
CREATE INDEX "ProductCategory_createdAt_idx" ON "ProductCategory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_organizationId_id_key" ON "ProductCategory"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ProductPlan_organizationId_idx" ON "ProductPlan"("organizationId");

-- CreateIndex
CREATE INDEX "ProductPlan_productId_idx" ON "ProductPlan"("productId");

-- CreateIndex
CREATE INDEX "ProductPlan_organizationId_productId_order_idx" ON "ProductPlan"("organizationId", "productId", "order");

-- CreateIndex
CREATE INDEX "ProductPlan_customerSegment_idx" ON "ProductPlan"("customerSegment");

-- CreateIndex
CREATE INDEX "ProductPlan_active_idx" ON "ProductPlan"("active");

-- CreateIndex
CREATE INDEX "ProductPlan_createdAt_idx" ON "ProductPlan"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPlan_organizationId_id_key" ON "ProductPlan"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPlan_organizationId_productId_id_key" ON "ProductPlan"("organizationId", "productId", "id");

-- CreateIndex
CREATE INDEX "ProductVariant_organizationId_idx" ON "ProductVariant"("organizationId");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_planId_idx" ON "ProductVariant"("planId");

-- CreateIndex
CREATE INDEX "ProductVariant_organizationId_productId_order_idx" ON "ProductVariant"("organizationId", "productId", "order");

-- CreateIndex
CREATE INDEX "ProductVariant_active_idx" ON "ProductVariant"("active");

-- CreateIndex
CREATE INDEX "ProductVariant_createdAt_idx" ON "ProductVariant"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_organizationId_id_key" ON "ProductVariant"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_organizationId_productId_id_key" ON "ProductVariant"("organizationId", "productId", "id");

-- CreateIndex
CREATE INDEX "PriceBook_organizationId_idx" ON "PriceBook"("organizationId");

-- CreateIndex
CREATE INDEX "PriceBook_status_idx" ON "PriceBook"("status");

-- CreateIndex
CREATE INDEX "PriceBook_customerSegment_idx" ON "PriceBook"("customerSegment");

-- CreateIndex
CREATE INDEX "PriceBook_countryCode_idx" ON "PriceBook"("countryCode");

-- CreateIndex
CREATE INDEX "PriceBook_currency_idx" ON "PriceBook"("currency");

-- CreateIndex
CREATE INDEX "PriceBook_validFrom_validUntil_idx" ON "PriceBook"("validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "PriceBook_createdAt_idx" ON "PriceBook"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBook_organizationId_id_key" ON "PriceBook"("organizationId", "id");

-- CreateIndex
CREATE INDEX "PriceBookEntry_organizationId_idx" ON "PriceBookEntry"("organizationId");

-- CreateIndex
CREATE INDEX "PriceBookEntry_priceBookId_idx" ON "PriceBookEntry"("priceBookId");

-- CreateIndex
CREATE INDEX "PriceBookEntry_productId_idx" ON "PriceBookEntry"("productId");

-- CreateIndex
CREATE INDEX "PriceBookEntry_planId_idx" ON "PriceBookEntry"("planId");

-- CreateIndex
CREATE INDEX "PriceBookEntry_variantId_idx" ON "PriceBookEntry"("variantId");

-- CreateIndex
CREATE INDEX "PriceBookEntry_active_idx" ON "PriceBookEntry"("active");

-- CreateIndex
CREATE INDEX "PriceBookEntry_validFrom_validUntil_idx" ON "PriceBookEntry"("validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "PriceBookEntry_createdAt_idx" ON "PriceBookEntry"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBookEntry_organizationId_id_key" ON "PriceBookEntry"("organizationId", "id");

-- CreateIndex
CREATE INDEX "PriceHistory_organizationId_idx" ON "PriceHistory"("organizationId");

-- CreateIndex
CREATE INDEX "PriceHistory_priceBookEntryId_idx" ON "PriceHistory"("priceBookEntryId");

-- CreateIndex
CREATE INDEX "PriceHistory_changedByUserId_idx" ON "PriceHistory"("changedByUserId");

-- CreateIndex
CREATE INDEX "PriceHistory_changedAt_idx" ON "PriceHistory"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceHistory_organizationId_id_key" ON "PriceHistory"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Product_organizationId_categoryId_idx" ON "Product"("organizationId", "categoryId");

-- CreateIndex
CREATE INDEX "Product_organizationId_slug_idx" ON "Product"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_type_idx" ON "Product"("type");

-- CreateIndex
CREATE INDEX "Product_fulfillmentMode_idx" ON "Product"("fulfillmentMode");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_categoryId_fkey" FOREIGN KEY ("organizationId", "categoryId") REFERENCES "ProductCategory"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPlan" ADD CONSTRAINT "ProductPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPlan" ADD CONSTRAINT "ProductPlan_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_organizationId_productId_planId_fkey" FOREIGN KEY ("organizationId", "productId", "planId") REFERENCES "ProductPlan"("organizationId", "productId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBook" ADD CONSTRAINT "PriceBook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_organizationId_priceBookId_fkey" FOREIGN KEY ("organizationId", "priceBookId") REFERENCES "PriceBook"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_organizationId_productId_planId_fkey" FOREIGN KEY ("organizationId", "productId", "planId") REFERENCES "ProductPlan"("organizationId", "productId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_organizationId_productId_variantId_fkey" FOREIGN KEY ("organizationId", "productId", "variantId") REFERENCES "ProductVariant"("organizationId", "productId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_organizationId_priceBookEntryId_fkey" FOREIGN KEY ("organizationId", "priceBookEntryId") REFERENCES "PriceBookEntry"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_organizationId_changedByUserId_fkey" FOREIGN KEY ("organizationId", "changedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Catalog uniqueness is scoped to active, non-deleted records so soft delete and restore remain reversible.
CREATE UNIQUE INDEX "ProductCategory_organizationId_slug_active_key"
ON "ProductCategory" ("organizationId", "slug")
WHERE "deletedAt" IS NULL AND "active" = true;

CREATE UNIQUE INDEX "Product_organizationId_slug_active_key"
ON "Product" ("organizationId", "slug")
WHERE "deletedAt" IS NULL AND "active" = true;

CREATE UNIQUE INDEX "ProductPlan_productId_code_active_key"
ON "ProductPlan" ("organizationId", "productId", "code")
WHERE "deletedAt" IS NULL AND "active" = true AND "code" IS NOT NULL;

CREATE UNIQUE INDEX "ProductVariant_productId_code_active_key"
ON "ProductVariant" ("organizationId", "productId", "code")
WHERE "deletedAt" IS NULL AND "active" = true AND "code" IS NOT NULL;

CREATE UNIQUE INDEX "PriceBook_default_scope_active_key"
ON "PriceBook" ("organizationId", "customerSegment", COALESCE("countryCode", ''), "currency")
WHERE "deletedAt" IS NULL AND "archivedAt" IS NULL AND "isDefault" = true AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "PriceBookEntry_active_combination_key"
ON "PriceBookEntry" (
  "organizationId",
  "priceBookId",
  "productId",
  COALESCE("planId", '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE("variantId", '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE "deletedAt" IS NULL AND "active" = true;

ALTER TABLE "ProductCategory"
ADD CONSTRAINT "ProductCategory_order_positive_chk" CHECK ("order" > 0);

ALTER TABLE "ProductPlan"
ADD CONSTRAINT "ProductPlan_order_positive_chk" CHECK ("order" > 0),
ADD CONSTRAINT "ProductPlan_billingPeriodCount_positive_chk" CHECK ("billingPeriodCount" BETWEEN 1 AND 120),
ADD CONSTRAINT "ProductPlan_quantity_nonnegative_chk" CHECK ("quantity" IS NULL OR "quantity" >= 0),
ADD CONSTRAINT "ProductPlan_deviceLimit_positive_chk" CHECK ("deviceLimit" IS NULL OR "deviceLimit" > 0),
ADD CONSTRAINT "ProductPlan_creditAmount_nonnegative_chk" CHECK ("creditAmount" IS NULL OR "creditAmount" >= 0);

ALTER TABLE "ProductVariant"
ADD CONSTRAINT "ProductVariant_order_positive_chk" CHECK ("order" > 0);

ALTER TABLE "PriceBook"
ADD CONSTRAINT "PriceBook_priority_nonnegative_chk" CHECK ("priority" >= 0),
ADD CONSTRAINT "PriceBook_countryCode_format_chk" CHECK ("countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$'),
ADD CONSTRAINT "PriceBook_currency_format_chk" CHECK ("currency" ~ '^[A-Z]{3}$'),
ADD CONSTRAINT "PriceBook_validity_chk" CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" > "validFrom");

ALTER TABLE "PriceBookEntry"
ADD CONSTRAINT "PriceBookEntry_salePrice_nonnegative_chk" CHECK ("salePrice" >= 0),
ADD CONSTRAINT "PriceBookEntry_costPrice_nonnegative_chk" CHECK ("costPrice" IS NULL OR "costPrice" >= 0),
ADD CONSTRAINT "PriceBookEntry_minimumPrice_nonnegative_chk" CHECK ("minimumPrice" IS NULL OR "minimumPrice" >= 0),
ADD CONSTRAINT "PriceBookEntry_minimum_le_sale_chk" CHECK ("minimumPrice" IS NULL OR "minimumPrice" <= "salePrice"),
ADD CONSTRAINT "PriceBookEntry_validity_chk" CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" > "validFrom");

ALTER TABLE "Product"
ADD CONSTRAINT "Product_demo_duration_chk" CHECK (
  ("allowsDemo" = false AND "demoDurationHours" IS NULL)
  OR ("allowsDemo" = true AND "demoDurationHours" BETWEEN 1 AND 168)
);
