ALTER TABLE "Opportunity"
  ADD COLUMN "categoryId" UUID;

ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_categoryId_fkey"
  FOREIGN KEY ("organizationId", "categoryId")
  REFERENCES "ProductCategory"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Opportunity_organizationId_categoryId_idx"
  ON "Opportunity"("organizationId", "categoryId");

CREATE TABLE "OpportunityInterestHistory" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "opportunityId" UUID NOT NULL,
  "categoryId" UUID,
  "productId" UUID,
  "changedByUserId" UUID,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OpportunityInterestHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpportunityInterestHistory_organizationId_id_key"
  ON "OpportunityInterestHistory"("organizationId", "id");

CREATE INDEX "OpportunityInterestHistory_organizationId_opportunityId_createdAt_idx"
  ON "OpportunityInterestHistory"("organizationId", "opportunityId", "createdAt");

CREATE INDEX "OpportunityInterestHistory_organizationId_categoryId_createdAt_idx"
  ON "OpportunityInterestHistory"("organizationId", "categoryId", "createdAt");

CREATE INDEX "OpportunityInterestHistory_organizationId_productId_createdAt_idx"
  ON "OpportunityInterestHistory"("organizationId", "productId", "createdAt");

ALTER TABLE "OpportunityInterestHistory"
  ADD CONSTRAINT "OpportunityInterestHistory_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpportunityInterestHistory_opportunity_fkey"
  FOREIGN KEY ("organizationId", "opportunityId") REFERENCES "Opportunity"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpportunityInterestHistory_category_fkey"
  FOREIGN KEY ("organizationId", "categoryId") REFERENCES "ProductCategory"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpportunityInterestHistory_product_fkey"
  FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OpportunityInterestHistory_changedByUser_fkey"
  FOREIGN KEY ("organizationId", "changedByUserId") REFERENCES "User"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
