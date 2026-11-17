-- Additive source identity ledger and server-owned approval snapshots only.
-- No existing table rows are changed, merged or removed.
CREATE TABLE "ZonalDeliveryPreview" (
 "id" TEXT PRIMARY KEY, "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "from" DATE NOT NULL, "to" DATE NOT NULL, "connectionRevision" INTEGER NOT NULL,
 "payload" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'PREVIEW', "result" JSONB
);
CREATE INDEX "ZonalDeliveryPreview_restaurantId_createdAt_idx" ON "ZonalDeliveryPreview"("restaurantId","createdAt");
CREATE TABLE "ZonalDeliveryImport" (
 "id" TEXT PRIMARY KEY, "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "supplierId" TEXT NOT NULL REFERENCES "Supplier"("id") ON DELETE RESTRICT,
 "purchaseId" TEXT NOT NULL UNIQUE REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT,
 "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "location" TEXT NOT NULL, "deliveryId" TEXT NOT NULL, "documentKey" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ZonalDeliveryImport_restaurantId_location_deliveryId_key" UNIQUE("restaurantId","location","deliveryId"),
 CONSTRAINT "ZonalDeliveryImport_restaurantId_supplierId_documentKey_key" UNIQUE("restaurantId","supplierId","documentKey")
);
