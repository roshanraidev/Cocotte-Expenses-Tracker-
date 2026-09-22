-- Preserve existing invoices; unassigned supplier is allowed only during review.
ALTER TABLE "PackagingInvoice" ALTER COLUMN "supplierId" DROP NOT NULL;
ALTER TABLE "PackagingInvoice" ADD CONSTRAINT "packaging_confirmed_supplier"
CHECK (status <> 'CONFIRMED' OR "supplierId" IS NOT NULL);
