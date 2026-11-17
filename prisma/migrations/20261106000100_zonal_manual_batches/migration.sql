-- Additive operational metadata only. No existing financial tables are changed.
CREATE TABLE "ZonalSyncBatch" (
 "id" TEXT PRIMARY KEY,
 "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "branch" TEXT NOT NULL, "from" DATE NOT NULL, "to" DATE NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'RUNNING' CHECK ("status" IN ('RUNNING','COMPLETED','PARTIAL','FAILED','CANCELLED','INTERRUPTED')),
 "connectionRevision" INTEGER NOT NULL,
 "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3),
 CHECK ("to">="from" AND "to"-"from"<31)
);
CREATE INDEX "ZonalSyncBatch_restaurantId_createdAt_idx" ON "ZonalSyncBatch"("restaurantId","createdAt");
CREATE UNIQUE INDEX "zonal_one_running_batch" ON "ZonalSyncBatch"("restaurantId") WHERE "status"='RUNNING';
CREATE TABLE "ZonalSyncDay" (
 "id" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL REFERENCES "ZonalSyncBatch"("id") ON DELETE RESTRICT,
 "date" DATE NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','NEW','CHANGED','UNCHANGED','BLOCKED','FAILED','APPROVED')),
 "attempted" BOOLEAN NOT NULL DEFAULT false, "errorCode" TEXT, "approvalError" TEXT,
 "previewId" TEXT REFERENCES "ZonalImport"("id") ON DELETE RESTRICT, "checkedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "ZonalSyncDay_batchId_date_key" ON "ZonalSyncDay"("batchId","date");
