-- CreateEnum
CREATE TYPE "CommunicationSyncChannel" AS ENUM ('WHATSAPP_READ_ONLY');

-- CreateEnum
CREATE TYPE "CommunicationSyncStatus" AS ENUM ('IDLE', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "CommunicationSyncCheckpoint" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "channel" "CommunicationSyncChannel" NOT NULL,
    "status" "CommunicationSyncStatus" NOT NULL DEFAULT 'IDLE',
    "cursorAt" TIMESTAMP(3),
    "cursorId" UUID,
    "lastSynchronizedAt" TIMESTAMP(3),
    "lastSuccessfulAt" TIMESTAMP(3),
    "messagesImported" INTEGER NOT NULL DEFAULT 0,
    "conversationsImported" INTEGER NOT NULL DEFAULT 0,
    "contactsImported" INTEGER NOT NULL DEFAULT 0,
    "duplicatesAvoided" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationSyncCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationSyncCheckpoint_organizationId_status_lastSynch_idx" ON "CommunicationSyncCheckpoint"("organizationId", "status", "lastSynchronizedAt");

-- CreateIndex
CREATE INDEX "CommunicationSyncCheckpoint_organizationId_cursorAt_cursorI_idx" ON "CommunicationSyncCheckpoint"("organizationId", "cursorAt", "cursorId");

-- CreateIndex
CREATE INDEX "CommunicationSyncCheckpoint_nextRetryAt_idx" ON "CommunicationSyncCheckpoint"("nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationSyncCheckpoint_organizationId_id_key" ON "CommunicationSyncCheckpoint"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationSyncCheckpoint_organizationId_channel_key" ON "CommunicationSyncCheckpoint"("organizationId", "channel");

-- AddForeignKey
ALTER TABLE "CommunicationSyncCheckpoint" ADD CONSTRAINT "CommunicationSyncCheckpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
