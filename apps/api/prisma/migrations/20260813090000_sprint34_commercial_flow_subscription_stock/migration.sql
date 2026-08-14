CREATE TYPE "ProductStockMovementType" AS ENUM ('ENTRY', 'EXIT', 'ADJUSTMENT', 'RETURN');

ALTER TABLE "Opportunity"
  ADD COLUMN "estimatedPurchaseAt" TIMESTAMP(3);

CREATE INDEX "Opportunity_organizationId_estimatedPurchaseAt_idx"
  ON "Opportunity"("organizationId", "estimatedPurchaseAt");

ALTER TABLE "ProductStockMovement"
  ADD COLUMN "movementType" "ProductStockMovementType" NOT NULL DEFAULT 'ADJUSTMENT';

CREATE INDEX "ProductStockMovement_organizationId_productId_movementType_createdAt_idx"
  ON "ProductStockMovement"("organizationId", "productId", "movementType", "createdAt");
