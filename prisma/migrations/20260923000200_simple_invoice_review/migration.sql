ALTER TYPE "PackagingCategory" ADD VALUE 'UNCLASSIFIED';
ALTER TABLE "PackagingInvoice" ALTER COLUMN "orderDate" DROP NOT NULL;
ALTER TABLE "PackagingInvoice" ALTER COLUMN "deliveryDate" DROP NOT NULL;
ALTER TABLE "PackagingInvoice" ADD COLUMN "orderNumber" TEXT;
ALTER TABLE "PackagingLine" ADD COLUMN "priceBasis" TEXT NOT NULL DEFAULT 'INVOICE';
