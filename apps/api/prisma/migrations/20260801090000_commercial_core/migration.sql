-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'PAYPAL', 'BINANCE', 'MERCADOPAGO', 'STRIPE', 'CASH', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('TRIAL', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('PENDING', 'DUE', 'OVERDUE', 'PAID', 'CANCELLED');

-- AlterEnum
DROP INDEX IF EXISTS "Sale_opportunityId_active_key";
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED');
ALTER TABLE "Payment" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING (
  CASE "status"::text
    WHEN 'COMPLETED' THEN 'CONFIRMED'
    WHEN 'CANCELLED' THEN 'FAILED'
    ELSE "status"::text
  END::"PaymentStatus_new"
);
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "PaymentStatus_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SaleStatus_new" AS ENUM ('DRAFT', 'PENDING', 'CONFIRMED', 'FULFILLED', 'CANCELLED');
ALTER TABLE "Sale" ALTER COLUMN "status" TYPE "SaleStatus_new" USING (
  CASE "status"::text
    WHEN 'OPEN' THEN 'PENDING'
    WHEN 'WON' THEN 'FULFILLED'
    ELSE "status"::text
  END::"SaleStatus_new"
);
ALTER TYPE "SaleStatus" RENAME TO "SaleStatus_old";
ALTER TYPE "SaleStatus_new" RENAME TO "SaleStatus";
DROP TYPE "SaleStatus_old";
COMMIT;

-- DropIndex
DROP INDEX "Payment_saleId_idx";

-- DropIndex
DROP INDEX "Payment_status_idx";

-- DropIndex
DROP INDEX "Sale_opportunityId_idx";

-- DropIndex
DROP INDEX "Sale_status_idx";

-- DropIndex
DROP INDEX "Sale_userId_idx";

-- DropIndex
DROP INDEX "SaleItem_productId_idx";

-- DropIndex
DROP INDEX "SaleItem_saleId_idx";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "paymentDate" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "feeAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "grossAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "netAmount" SET DATA TYPE DECIMAL(18,2);

ALTER TABLE "Payment" RENAME COLUMN "method" TO "method_legacy";
ALTER TABLE "Payment" ADD COLUMN "method" "PaymentMethod" NOT NULL DEFAULT 'OTHER';
UPDATE "Payment"
SET "method" = CASE UPPER(TRIM("method_legacy"))
  WHEN 'TRANSFER' THEN 'TRANSFER'::"PaymentMethod"
  WHEN 'PAYPAL' THEN 'PAYPAL'::"PaymentMethod"
  WHEN 'BINANCE' THEN 'BINANCE'::"PaymentMethod"
  WHEN 'MERCADOPAGO' THEN 'MERCADOPAGO'::"PaymentMethod"
  WHEN 'STRIPE' THEN 'STRIPE'::"PaymentMethod"
  WHEN 'CASH' THEN 'CASH'::"PaymentMethod"
  WHEN 'MANUAL' THEN 'MANUAL'::"PaymentMethod"
  ELSE 'OTHER'::"PaymentMethod"
END;
ALTER TABLE "Payment" DROP COLUMN "method_legacy";

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "contactId" UUID;
UPDATE "Sale" AS sale
SET "contactId" = opportunity."contactId"
FROM "Opportunity" AS opportunity
WHERE sale."organizationId" = opportunity."organizationId"
  AND sale."opportunityId" = opportunity."id"
  AND sale."contactId" IS NULL;
ALTER TABLE "Sale" ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "Sale" ADD COLUMN     "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "opportunityId" DROP NOT NULL,
ALTER COLUMN "total" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "billingPeriodCountSnapshot" INTEGER,
ADD COLUMN     "billingPeriodUnitSnapshot" "BillingPeriodUnit",
ADD COLUMN     "catalogSnapshot" JSONB,
ADD COLUMN     "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "fulfillmentModeSnapshot" "FulfillmentMode",
ADD COLUMN     "planId" UUID,
ADD COLUMN     "planNameSnapshot" TEXT,
ADD COLUMN     "priceBookEntryId" UUID,
ADD COLUMN     "productSlugSnapshot" TEXT,
ADD COLUMN     "productTypeSnapshot" "ProductType",
ADD COLUMN     "requiresSubscriptionSnapshot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "variantId" UUID,
ADD COLUMN     "variantNameSnapshot" TEXT,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(18,2);

UPDATE "SaleItem"
SET "catalogSnapshot" = jsonb_build_object(
  'productName', "productNameSnapshot",
  'sku', "skuSnapshot",
  'source', 'legacy-migration'
)
WHERE "catalogSnapshot" IS NULL;
ALTER TABLE "SaleItem" ALTER COLUMN "catalogSnapshot" SET NOT NULL;

CREATE UNIQUE INDEX "Sale_organizationId_opportunityId_active_key"
ON "Sale" ("organizationId", "opportunityId")
WHERE "deletedAt" IS NULL AND "opportunityId" IS NOT NULL AND "status" <> 'CANCELLED';

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "saleItemId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "userId" UUID,
    "productId" UUID,
    "planId" UUID,
    "variantId" UUID,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "billingCycle" "BillingCycle" NOT NULL,
    "customIntervalDays" INTEGER,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "productNameSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT,
    "planNameSnapshot" TEXT,
    "variantNameSnapshot" TEXT,
    "catalogSnapshot" JSONB NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "nextBillingAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Renewal" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "sourceSaleId" UUID NOT NULL,
    "generatedSaleId" UUID,
    "userId" UUID,
    "status" "RenewalStatus" NOT NULL DEFAULT 'PENDING',
    "billingCycle" "BillingCycle" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "productNameSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT,
    "catalogSnapshot" JSONB NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Renewal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscription_organizationId_idx" ON "Subscription"("organizationId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_saleId_idx" ON "Subscription"("organizationId", "saleId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_contactId_idx" ON "Subscription"("organizationId", "contactId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_userId_idx" ON "Subscription"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_status_idx" ON "Subscription"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_nextBillingAt_idx" ON "Subscription"("organizationId", "nextBillingAt");

-- CreateIndex
CREATE INDEX "Subscription_createdAt_idx" ON "Subscription"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_id_key" ON "Subscription"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_saleItemId_key" ON "Subscription"("organizationId", "saleItemId");

-- CreateIndex
CREATE INDEX "Renewal_organizationId_idx" ON "Renewal"("organizationId");

-- CreateIndex
CREATE INDEX "Renewal_organizationId_subscriptionId_idx" ON "Renewal"("organizationId", "subscriptionId");

-- CreateIndex
CREATE INDEX "Renewal_organizationId_sourceSaleId_idx" ON "Renewal"("organizationId", "sourceSaleId");

-- CreateIndex
CREATE INDEX "Renewal_organizationId_userId_idx" ON "Renewal"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Renewal_organizationId_status_idx" ON "Renewal"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Renewal_organizationId_dueAt_idx" ON "Renewal"("organizationId", "dueAt");

-- CreateIndex
CREATE INDEX "Renewal_createdAt_idx" ON "Renewal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Renewal_organizationId_id_key" ON "Renewal"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Renewal_organizationId_generatedSaleId_key" ON "Renewal"("organizationId", "generatedSaleId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_saleId_idx" ON "Payment"("organizationId", "saleId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_status_idx" ON "Payment"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_idempotencyKey_key" ON "Payment"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Sale_organizationId_opportunityId_idx" ON "Sale"("organizationId", "opportunityId");

-- CreateIndex
CREATE INDEX "Sale_organizationId_contactId_idx" ON "Sale"("organizationId", "contactId");

-- CreateIndex
CREATE INDEX "Sale_organizationId_userId_idx" ON "Sale"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Sale_organizationId_status_idx" ON "Sale"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Sale_organizationId_currency_idx" ON "Sale"("organizationId", "currency");

-- CreateIndex
CREATE INDEX "SaleItem_organizationId_saleId_idx" ON "SaleItem"("organizationId", "saleId");

-- CreateIndex
CREATE INDEX "SaleItem_organizationId_productId_idx" ON "SaleItem"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "SaleItem_organizationId_planId_idx" ON "SaleItem"("organizationId", "planId");

-- CreateIndex
CREATE INDEX "SaleItem_organizationId_variantId_idx" ON "SaleItem"("organizationId", "variantId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_organizationId_planId_fkey" FOREIGN KEY ("organizationId", "planId") REFERENCES "ProductPlan"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_organizationId_variantId_fkey" FOREIGN KEY ("organizationId", "variantId") REFERENCES "ProductVariant"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_organizationId_priceBookEntryId_fkey" FOREIGN KEY ("organizationId", "priceBookEntryId") REFERENCES "PriceBookEntry"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_saleId_fkey" FOREIGN KEY ("organizationId", "saleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_saleItemId_fkey" FOREIGN KEY ("organizationId", "saleItemId") REFERENCES "SaleItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_planId_fkey" FOREIGN KEY ("organizationId", "planId") REFERENCES "ProductPlan"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_variantId_fkey" FOREIGN KEY ("organizationId", "variantId") REFERENCES "ProductVariant"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_organizationId_subscriptionId_fkey" FOREIGN KEY ("organizationId", "subscriptionId") REFERENCES "Subscription"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_organizationId_sourceSaleId_fkey" FOREIGN KEY ("organizationId", "sourceSaleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_organizationId_generatedSaleId_fkey" FOREIGN KEY ("organizationId", "generatedSaleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add commercial integrity checks
ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_discountAmount_nonnegative_chk" CHECK ("discountAmount" >= 0),
  ADD CONSTRAINT "Sale_taxAmount_nonnegative_chk" CHECK ("taxAmount" >= 0);

ALTER TABLE "SaleItem"
  ADD CONSTRAINT "SaleItem_discountAmount_nonnegative_chk" CHECK ("discountAmount" >= 0),
  ADD CONSTRAINT "SaleItem_taxAmount_nonnegative_chk" CHECK ("taxAmount" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_refundedAmount_nonnegative_chk" CHECK ("refundedAmount" >= 0),
  ADD CONSTRAINT "Payment_refundedAmount_lte_netAmount_chk" CHECK ("refundedAmount" <= "netAmount");

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_amount_nonnegative_chk" CHECK ("amount" >= 0),
  ADD CONSTRAINT "Subscription_quantity_positive_chk" CHECK ("quantity" > 0);

ALTER TABLE "Renewal"
  ADD CONSTRAINT "Renewal_amount_nonnegative_chk" CHECK ("amount" >= 0);
