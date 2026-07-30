ALTER TABLE "User"
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Santiago';

ALTER TABLE "Product"
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "publicVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stockTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stockQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stockReserved" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stockMinimum" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_stock_non_negative_check"
CHECK ("stockQuantity" >= 0 AND "stockReserved" >= 0 AND "stockMinimum" >= 0),
ADD CONSTRAINT "Product_stock_reserved_within_quantity_check"
CHECK ("stockReserved" <= "stockQuantity");

CREATE TABLE "ProductStockMovement" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "userId" UUID,
    "quantityBefore" INTEGER NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductStockMovement_organizationId_id_key"
ON "ProductStockMovement"("organizationId", "id");
CREATE INDEX "ProductStockMovement_organizationId_productId_createdAt_idx"
ON "ProductStockMovement"("organizationId", "productId", "createdAt");
CREATE INDEX "ProductStockMovement_organizationId_userId_idx"
ON "ProductStockMovement"("organizationId", "userId");

ALTER TABLE "ProductStockMovement"
ADD CONSTRAINT "ProductStockMovement_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductStockMovement"
ADD CONSTRAINT "ProductStockMovement_organizationId_productId_fkey"
FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductStockMovement"
ADD CONSTRAINT "ProductStockMovement_organizationId_userId_fkey"
FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductStockMovement"
ADD CONSTRAINT "ProductStockMovement_quantity_check"
CHECK ("quantityBefore" >= 0 AND "quantityAfter" >= 0 AND "quantityAfter" = "quantityBefore" + "quantityDelta");
