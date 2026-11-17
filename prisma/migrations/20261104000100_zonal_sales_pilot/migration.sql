CREATE TABLE "ZonalImport" (
 "id" TEXT PRIMARY KEY, "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "date" DATE NOT NULL, "branch" TEXT NOT NULL, "source" TEXT NOT NULL CHECK ("source" IN ('ZONAL_MANUAL', 'ZONAL_BROWSER')),
 "status" TEXT NOT NULL DEFAULT 'PREVIEW' CHECK ("status" IN ('PREVIEW','APPROVED','CANCELLED')),
 "payload" JSONB NOT NULL, "fingerprint" TEXT NOT NULL, "salesVersion" INTEGER NOT NULL,
 "previousPence" BIGINT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3)
);
CREATE INDEX "ZonalImport_restaurantId_createdAt_idx" ON "ZonalImport"("restaurantId", "createdAt");
CREATE INDEX "ZonalImport_restaurantId_date_fingerprint_idx" ON "ZonalImport"("restaurantId", "date", "fingerprint");
