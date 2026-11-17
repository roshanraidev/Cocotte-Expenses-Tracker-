-- Additive only: no changes to financial, credential or existing integration rows.
CREATE TABLE "ZonalSalesJob" (
 "id" TEXT PRIMARY KEY, "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL, "phase" TEXT NOT NULL DEFAULT 'FETCH', "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "from" DATE NOT NULL, "to" DATE NOT NULL, "latestAvailable" DATE,
 "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "activeBatchId" TEXT, "approvalReason" TEXT, "lastError" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ZonalSalesJob_range" CHECK ("from" <= "to"),
 CONSTRAINT "ZonalSalesJob_kind" CHECK ("kind" IN ('HISTORY','DAILY')),
 CONSTRAINT "ZonalSalesJob_phase" CHECK ("phase" IN ('FETCH','APPROVE')),
 CONSTRAINT "ZonalSalesJob_status" CHECK ("status" IN ('QUEUED','RUNNING','PAUSED','REVIEW','COMPLETE'))
);
CREATE INDEX "ZonalSalesJob_status_leaseUntil_idx" ON "ZonalSalesJob"("status","leaseUntil");
CREATE INDEX "ZonalSalesJob_restaurantId_createdAt_idx" ON "ZonalSalesJob"("restaurantId","createdAt");
-- One active/paused durable job per restaurant. Completed/review jobs retain history.
CREATE UNIQUE INDEX "ZonalSalesJob_one_active" ON "ZonalSalesJob"("restaurantId") WHERE "status" IN ('QUEUED','RUNNING','PAUSED');
CREATE TABLE "ZonalSalesJobDay" (
 "id" TEXT PRIMARY KEY, "jobId" TEXT NOT NULL REFERENCES "ZonalSalesJob"("id") ON DELETE RESTRICT,
 "date" DATE NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "previewId" TEXT, "fingerprint" TEXT,
 "reason" TEXT, "processedAt" TIMESTAMP(3),
 CONSTRAINT "ZonalSalesJobDay_status" CHECK ("status" IN ('PENDING','STAGED','SKIPPED','FAILED','UNAVAILABLE','APPROVAL_QUEUED','APPROVED','EXCEPTION'))
);
CREATE UNIQUE INDEX "ZonalSalesJobDay_jobId_date_key" ON "ZonalSalesJobDay"("jobId","date");
CREATE INDEX "ZonalSalesJobDay_previewId_idx" ON "ZonalSalesJobDay"("previewId");
CREATE TABLE "ZonalSalesWorker" ("id" TEXT PRIMARY KEY,"heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
