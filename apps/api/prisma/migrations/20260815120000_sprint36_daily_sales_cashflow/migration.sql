ALTER TABLE "Sale"
  ADD COLUMN "paymentDueAt" TIMESTAMP(3);

ALTER TABLE "Expense"
  ADD COLUMN "reference" TEXT;

CREATE INDEX "Sale_organizationId_paymentDueAt_idx"
  ON "Sale"("organizationId", "paymentDueAt");

CREATE INDEX "Expense_organizationId_expenseDate_currency_idx"
  ON "Expense"("organizationId", "expenseDate", "currency");
