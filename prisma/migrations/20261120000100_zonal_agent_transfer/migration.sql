-- Additive only. No updates to existing sales, imports, accounts or credentials.
CREATE TABLE "ZonalAgentOutbox" (
 "id" TEXT PRIMARY KEY, "sequence" BIGSERIAL NOT NULL UNIQUE,
 "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "agentId" TEXT NOT NULL, "date" DATE NOT NULL, "capturedAt" TIMESTAMP(3) NOT NULL,
 "payload" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "lastError" TEXT, "receipt" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "acknowledgedAt" TIMESTAMP(3),
 CONSTRAINT "ZonalAgentOutbox_status_check" CHECK ("status" IN ('PENDING','SENDING','ACKED','BLOCKED')),
 CONSTRAINT "ZonalAgentOutbox_attempts_check" CHECK ("attempts">=0)
);
CREATE INDEX "ZonalAgentOutbox_agentId_status_nextAttemptAt_idx" ON "ZonalAgentOutbox"("agentId","status","nextAttemptAt");
CREATE TABLE "ZonalAgentReceipt" (
 "id" TEXT PRIMARY KEY, "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "agentId" TEXT NOT NULL, "transferId" TEXT NOT NULL, "sequence" BIGINT NOT NULL,
 "date" DATE NOT NULL, "capturedAt" TIMESTAMP(3) NOT NULL, "bodyHash" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL, "status" TEXT NOT NULL,
 "previewId" TEXT REFERENCES "ZonalImport"("id") ON DELETE RESTRICT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ZonalAgentReceipt_agentId_transferId_key" UNIQUE ("agentId","transferId"),
 CONSTRAINT "ZonalAgentReceipt_agentId_sequence_key" UNIQUE ("agentId","sequence"),
 CONSTRAINT "ZonalAgentReceipt_sequence_check" CHECK ("sequence">0),
 CONSTRAINT "ZonalAgentReceipt_status_check" CHECK ("status" IN ('STAGED','EXPIRED_REVIEW','REUSED_PREVIEW','ALREADY_IMPORTED','STALE'))
);
CREATE INDEX "ZonalAgentReceipt_restaurantId_agentId_date_sequence_idx" ON "ZonalAgentReceipt"("restaurantId","agentId","date","sequence");
CREATE INDEX "ZonalAgentReceipt_agentId_createdAt_idx" ON "ZonalAgentReceipt"("agentId","createdAt");
