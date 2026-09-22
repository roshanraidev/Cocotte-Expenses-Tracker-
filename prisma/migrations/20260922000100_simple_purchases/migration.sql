ALTER TABLE "PurchaseInvoice" ADD COLUMN "submissionKey" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "orderDate" DATE;
CREATE UNIQUE INDEX "PurchaseInvoice_submissionKey_key" ON "PurchaseInvoice"("submissionKey");
-- Preserve existing order dates where the historical record supplies one.
UPDATE "PurchaseInvoice" AS p SET "orderDate" = o."orderDate"
FROM "SupplierOrder" AS o WHERE p."orderId" = o.id;
