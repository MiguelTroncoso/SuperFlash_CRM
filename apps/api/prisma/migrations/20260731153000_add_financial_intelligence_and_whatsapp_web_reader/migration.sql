-- CreateEnum
CREATE TYPE "ExpenseFrequency" AS ENUM ('ONE_TIME', 'WEEKLY', 'MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('TRANSFER', 'CARD', 'CASH', 'DIRECT_DEBIT', 'OTHER');

-- AlterEnum
ALTER TYPE "CommunicationSyncChannel" ADD VALUE 'WHATSAPP_WEB_READ_ONLY';

-- AlterTable
ALTER TABLE "CommunicationSyncCheckpoint" ADD COLUMN "historicalDiscarded" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "readerConnectedAt" TIMESTAMP(3), ADD COLUMN "readerDisconnectedAt" TIMESTAMP(3),
ADD COLUMN "readerLastMessageAt" TIMESTAMP(3), ADD COLUMN "readerLastSyncAt" TIMESTAMP(3),
ADD COLUMN "readerNumberMasked" TEXT, ADD COLUMN "readerQr" TEXT, ADD COLUMN "readerQrExpiresAt" TIMESTAMP(3),
ADD COLUMN "readerReconnectCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "readerStatus" TEXT,
ADD COLUMN "readerIngestionStartedAt" TIMESTAMP(3), ADD COLUMN "readerFirstAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "categoryId" UUID,
ADD COLUMN "endDate" TIMESTAMP(3), ADD COLUMN "frequency" "ExpenseFrequency" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN "generated" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "notes" TEXT, ADD COLUMN "occurrenceKey" TEXT,
ADD COLUMN "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'OTHER', ADD COLUMN "receiptUrl" TEXT,
ADD COLUMN "recurringExpenseId" UUID, ADD COLUMN "startDate" TIMESTAMP(3), ADD COLUMN "vendorName" TEXT;

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
    "color" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3), CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "categoryId" UUID, "name" TEXT NOT NULL,
    "vendorName" TEXT, "description" TEXT, "amount" DECIMAL(14,2) NOT NULL, "currency" TEXT NOT NULL,
    "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'OTHER', "frequency" "ExpenseFrequency" NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL, "endsOn" TIMESTAMP(3), "nextOccurrenceDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true, "pausedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3), "notes" TEXT,
    "receiptUrl" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3), CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseCategory_organizationId_active_idx" ON "ExpenseCategory"("organizationId", "active");
CREATE INDEX "ExpenseCategory_createdAt_idx" ON "ExpenseCategory"("createdAt");
CREATE UNIQUE INDEX "ExpenseCategory_organizationId_id_key" ON "ExpenseCategory"("organizationId", "id");
CREATE UNIQUE INDEX "ExpenseCategory_organizationId_name_key" ON "ExpenseCategory"("organizationId", "name");
CREATE INDEX "RecurringExpense_organizationId_active_nextOccurrenceDate_idx" ON "RecurringExpense"("organizationId", "active", "nextOccurrenceDate");
CREATE INDEX "RecurringExpense_organizationId_categoryId_idx" ON "RecurringExpense"("organizationId", "categoryId");
CREATE INDEX "RecurringExpense_createdAt_idx" ON "RecurringExpense"("createdAt");
CREATE UNIQUE INDEX "RecurringExpense_organizationId_id_key" ON "RecurringExpense"("organizationId", "id");
CREATE INDEX "Expense_organizationId_categoryId_expenseDate_idx" ON "Expense"("organizationId", "categoryId", "expenseDate");
CREATE INDEX "Expense_organizationId_recurringExpenseId_expenseDate_idx" ON "Expense"("organizationId", "recurringExpenseId", "expenseDate");
CREATE UNIQUE INDEX "Expense_organizationId_recurringExpenseId_occurrenceKey_key" ON "Expense"("organizationId", "recurringExpenseId", "occurrenceKey");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_categoryId_fkey" FOREIGN KEY ("organizationId", "categoryId") REFERENCES "ExpenseCategory"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_recurringExpenseId_fkey" FOREIGN KEY ("organizationId", "recurringExpenseId") REFERENCES "RecurringExpense"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_organizationId_categoryId_fkey" FOREIGN KEY ("organizationId", "categoryId") REFERENCES "ExpenseCategory"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
