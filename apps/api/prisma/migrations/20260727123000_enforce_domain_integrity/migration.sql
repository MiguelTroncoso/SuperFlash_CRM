-- AlterEnum
ALTER TYPE "FollowUpStatus" ADD VALUE 'RESCHEDULED';

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_contactId_fkey";

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_opportunityId_fkey";

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_saleId_fkey";

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_userId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_userId_fkey";

-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_userId_fkey";

-- DropForeignKey
ALTER TABLE "ContactTag" DROP CONSTRAINT "ContactTag_contactId_fkey";

-- DropForeignKey
ALTER TABLE "ContactTag" DROP CONSTRAINT "ContactTag_tagId_fkey";

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "FollowUp" DROP CONSTRAINT "FollowUp_opportunityId_fkey";

-- DropForeignKey
ALTER TABLE "FollowUp" DROP CONSTRAINT "FollowUp_userId_fkey";

-- DropForeignKey
ALTER TABLE "Opportunity" DROP CONSTRAINT "Opportunity_contactId_fkey";

-- DropForeignKey
ALTER TABLE "Opportunity" DROP CONSTRAINT "Opportunity_pipelineStageId_fkey";

-- DropForeignKey
ALTER TABLE "Opportunity" DROP CONSTRAINT "Opportunity_userId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_saleId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_opportunityId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_userId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";

-- DropForeignKey
ALTER TABLE "_ProductToSale" DROP CONSTRAINT "_ProductToSale_A_fkey";

-- DropForeignKey
ALTER TABLE "_ProductToSale" DROP CONSTRAINT "_ProductToSale_B_fkey";

-- DropIndex
DROP INDEX "Campaign_organizationId_name_key";

-- DropIndex
DROP INDEX "Campaign_userId_idx";

-- DropIndex
DROP INDEX "Contact_status_idx";

-- DropIndex
DROP INDEX "FollowUp_createdAt_idx";

-- DropIndex
DROP INDEX "FollowUp_date_idx";

-- DropIndex
DROP INDEX "Product_organizationId_sku_key";

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "deletedAt",
DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "status",
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "isCustomer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ALTER COLUMN "firstName" DROP NOT NULL;

-- AlterTable
ALTER TABLE "FollowUp" DROP COLUMN "date",
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "dueAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Opportunity" DROP COLUMN "amount",
ADD COLUMN     "archiveReason" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "campaignId" UUID,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "expectedAmount" DECIMAL(14,2),
ADD COLUMN     "productId" UUID,
ADD COLUMN     "wonAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "amount",
ADD COLUMN     "feeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "grossAmount" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "netAmount" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "billingType" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "durationDays" INTEGER;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "subtotal" DECIMAL(14,2) NOT NULL;

-- DropTable
DROP TABLE "_ProductToSale";

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "productId" UUID,
    "productNameSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleItem_organizationId_idx" ON "SaleItem"("organizationId");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");

-- CreateIndex
CREATE INDEX "SaleItem_createdAt_idx" ON "SaleItem"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SaleItem_organizationId_id_key" ON "SaleItem"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_organizationId_id_key" ON "Activity"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_organizationId_id_key" ON "AuditLog"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Campaign_platform_idx" ON "Campaign"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_organizationId_id_key" ON "Campaign"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_organizationId_platform_externalId_key" ON "Campaign"("organizationId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "Contact_organizationId_phoneNormalized_idx" ON "Contact"("organizationId", "phoneNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_id_key" ON "Contact"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ContactTag_organizationId_id_key" ON "ContactTag"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_organizationId_id_key" ON "Expense"("organizationId", "id");

-- CreateIndex
CREATE INDEX "FollowUp_dueAt_idx" ON "FollowUp"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUp_organizationId_id_key" ON "FollowUp"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Opportunity_campaignId_idx" ON "Opportunity"("campaignId");

-- CreateIndex
CREATE INDEX "Opportunity_productId_idx" ON "Opportunity"("productId");

-- CreateIndex
CREATE INDEX "Opportunity_closedAt_idx" ON "Opportunity"("closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_organizationId_id_key" ON "Opportunity"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Payment_paymentDate_idx" ON "Payment"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_id_key" ON "Payment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_organizationId_id_key" ON "PipelineStage"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_organizationId_name_key" ON "PipelineStage"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Product_organizationId_sku_idx" ON "Product"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_id_key" ON "Product"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_id_key" ON "Role"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Sale_soldAt_idx" ON "Sale"("soldAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_organizationId_id_key" ON "Sale"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_organizationId_id_key" ON "Tag"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_id_key" ON "User"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "Role"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_organizationId_tagId_fkey" FOREIGN KEY ("organizationId", "tagId") REFERENCES "Tag"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_pipelineStageId_fkey" FOREIGN KEY ("organizationId", "pipelineStageId") REFERENCES "PipelineStage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_opportunityId_fkey" FOREIGN KEY ("organizationId", "opportunityId") REFERENCES "Opportunity"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_saleId_fkey" FOREIGN KEY ("organizationId", "saleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_organizationId_opportunityId_fkey" FOREIGN KEY ("organizationId", "opportunityId") REFERENCES "Opportunity"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_organizationId_opportunityId_fkey" FOREIGN KEY ("organizationId", "opportunityId") REFERENCES "Opportunity"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_organizationId_saleId_fkey" FOREIGN KEY ("organizationId", "saleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_saleId_fkey" FOREIGN KEY ("organizationId", "saleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreatePartialUniqueIndex
CREATE UNIQUE INDEX "Contact_organizationId_phoneNormalized_active_key"
ON "Contact" ("organizationId", "phoneNormalized")
WHERE "deletedAt" IS NULL AND "phoneNormalized" IS NOT NULL;

-- CreatePartialUniqueIndex
CREATE UNIQUE INDEX "Product_organizationId_sku_active_key"
ON "Product" ("organizationId", "sku")
WHERE "deletedAt" IS NULL AND "sku" IS NOT NULL;

-- CreatePartialUniqueIndex
CREATE UNIQUE INDEX "Sale_opportunityId_active_key"
ON "Sale" ("opportunityId")
WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED';

-- AddCheckConstraint
ALTER TABLE "PipelineStage"
ADD CONSTRAINT "PipelineStage_order_positive_chk" CHECK ("order" > 0);

-- AddCheckConstraint
ALTER TABLE "Opportunity"
ADD CONSTRAINT "Opportunity_expectedAmount_nonnegative_chk"
CHECK ("expectedAmount" IS NULL OR "expectedAmount" >= 0);

-- AddCheckConstraint
ALTER TABLE "Product"
ADD CONSTRAINT "Product_price_nonnegative_chk" CHECK ("price" >= 0);

-- AddCheckConstraint
ALTER TABLE "Product"
ADD CONSTRAINT "Product_durationDays_nonnegative_chk"
CHECK ("durationDays" IS NULL OR "durationDays" >= 0);

-- AddCheckConstraint
ALTER TABLE "Sale"
ADD CONSTRAINT "Sale_subtotal_nonnegative_chk" CHECK ("subtotal" >= 0);

-- AddCheckConstraint
ALTER TABLE "Sale"
ADD CONSTRAINT "Sale_total_nonnegative_chk" CHECK ("total" >= 0);

-- AddCheckConstraint
ALTER TABLE "SaleItem"
ADD CONSTRAINT "SaleItem_quantity_positive_chk" CHECK ("quantity" > 0);

-- AddCheckConstraint
ALTER TABLE "SaleItem"
ADD CONSTRAINT "SaleItem_unitPrice_nonnegative_chk" CHECK ("unitPrice" >= 0);

-- AddCheckConstraint
ALTER TABLE "SaleItem"
ADD CONSTRAINT "SaleItem_total_nonnegative_chk" CHECK ("total" >= 0);

-- AddCheckConstraint
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_grossAmount_nonnegative_chk" CHECK ("grossAmount" >= 0);

-- AddCheckConstraint
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_feeAmount_nonnegative_chk" CHECK ("feeAmount" >= 0);

-- AddCheckConstraint
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_netAmount_nonnegative_chk" CHECK ("netAmount" >= 0);

-- AddCheckConstraint
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_netAmount_lte_grossAmount_chk" CHECK ("netAmount" <= "grossAmount");

-- AddCheckConstraint
ALTER TABLE "Expense"
ADD CONSTRAINT "Expense_amount_nonnegative_chk" CHECK ("amount" >= 0);
