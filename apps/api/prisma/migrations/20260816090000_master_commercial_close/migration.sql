ALTER TABLE "Sale"
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "paidNow" BOOLEAN NOT NULL DEFAULT false;
