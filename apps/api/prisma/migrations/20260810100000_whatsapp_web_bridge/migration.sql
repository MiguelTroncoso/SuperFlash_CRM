-- Sprint 29: transitional WhatsApp Web bridge channel configuration.
ALTER TYPE "WhatsAppMessageType" ADD VALUE IF NOT EXISTS 'STICKER';

CREATE TYPE "WhatsAppWebBridgeStatus" AS ENUM (
  'DISABLED',
  'PAIRING',
  'CONNECTED',
  'DISCONNECTED',
  'AUTHENTICATION_ERROR',
  'ERROR'
);

CREATE TABLE "WhatsAppWebBridgeChannel" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "channelKey" TEXT NOT NULL,
  "status" "WhatsAppWebBridgeStatus" NOT NULL DEFAULT 'DISABLED',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "phoneNumberMasked" TEXT,
  "lastConnectedAt" TIMESTAMP(3),
  "lastDisconnectedAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "ingestionStartedAt" TIMESTAMP(3),
  "firstAcceptedAt" TIMESTAMP(3),
  "reconnectCount" INTEGER NOT NULL DEFAULT 0,
  "historicalDiscarded" INTEGER NOT NULL DEFAULT 0,
  "duplicatesAvoided" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "WhatsAppWebBridgeChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppWebBridgeChannel_channelKey_key"
  ON "WhatsAppWebBridgeChannel"("channelKey");
CREATE UNIQUE INDEX "WhatsAppWebBridgeChannel_organizationId_key"
  ON "WhatsAppWebBridgeChannel"("organizationId");
CREATE UNIQUE INDEX "WhatsAppWebBridgeChannel_organizationId_id_key"
  ON "WhatsAppWebBridgeChannel"("organizationId", "id");
CREATE INDEX "WhatsAppWebBridgeChannel_organizationId_status_idx"
  ON "WhatsAppWebBridgeChannel"("organizationId", "status");
CREATE INDEX "WhatsAppWebBridgeChannel_organizationId_enabled_idx"
  ON "WhatsAppWebBridgeChannel"("organizationId", "enabled");
CREATE INDEX "WhatsAppWebBridgeChannel_lastHeartbeatAt_idx"
  ON "WhatsAppWebBridgeChannel"("lastHeartbeatAt");
CREATE INDEX "WhatsAppWebBridgeChannel_lastMessageAt_idx"
  ON "WhatsAppWebBridgeChannel"("lastMessageAt");
CREATE INDEX "WhatsAppWebBridgeChannel_createdAt_idx"
  ON "WhatsAppWebBridgeChannel"("createdAt");

ALTER TABLE "WhatsAppWebBridgeChannel"
  ADD CONSTRAINT "WhatsAppWebBridgeChannel_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WhatsAppWebBridgeRequest" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "channelId" UUID NOT NULL,
  "requestId" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppWebBridgeRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppWebBridgeRequest_organizationId_requestId_key"
  ON "WhatsAppWebBridgeRequest"("organizationId", "requestId");
CREATE UNIQUE INDEX "WhatsAppWebBridgeRequest_organizationId_signature_key"
  ON "WhatsAppWebBridgeRequest"("organizationId", "signature");
CREATE UNIQUE INDEX "WhatsAppWebBridgeRequest_organizationId_id_key"
  ON "WhatsAppWebBridgeRequest"("organizationId", "id");
CREATE INDEX "WhatsAppWebBridgeRequest_channelId_createdAt_idx"
  ON "WhatsAppWebBridgeRequest"("channelId", "createdAt");
CREATE INDEX "WhatsAppWebBridgeRequest_createdAt_idx"
  ON "WhatsAppWebBridgeRequest"("createdAt");

ALTER TABLE "WhatsAppWebBridgeRequest"
  ADD CONSTRAINT "WhatsAppWebBridgeRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WhatsAppWebBridgeRequest"
  ADD CONSTRAINT "WhatsAppWebBridgeRequest_organizationId_channelId_fkey"
  FOREIGN KEY ("organizationId", "channelId")
  REFERENCES "WhatsAppWebBridgeChannel"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
