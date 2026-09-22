-- CreateEnum
CREATE TYPE "PackagingCategory" AS ENUM ('PACKAGING', 'CHEMICAL');

-- CreateEnum
CREATE TYPE "PackagingInvoiceStatus" AS ENUM ('REVIEW', 'CONFIRMED', 'VOIDED');

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "foodWorkspace" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "packagingWorkspace" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PackagingProduct" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "category" "PackagingCategory" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "packSize" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingAlias" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionKey" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "packSize" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackagingAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingInvoice" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "submissionKey" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "invoiceDate" DATE,
    "invoiceNumber" TEXT,
    "numberKey" TEXT,
    "status" "PackagingInvoiceStatus" NOT NULL DEFAULT 'REVIEW',
    "netPence" BIGINT,
    "vatPence" BIGINT,
    "grossPence" BIGINT,
    "extractedText" TEXT NOT NULL DEFAULT '',
    "extraction" JSONB,
    "review" JSONB,
    "scanNote" TEXT NOT NULL DEFAULT '',
    "reviewReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingDocument" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackagingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "originalDescription" TEXT NOT NULL,
    "category" "PackagingCategory" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "packSize" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(14,4),
    "unitPrice" DECIMAL(14,4),
    "netPence" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PackagingLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackagingProduct_restaurantId_nameKey_unit_packSize_categor_key" ON "PackagingProduct"("restaurantId", "nameKey", "unit", "packSize", "category");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingAlias_supplierId_descriptionKey_unit_packSize_key" ON "PackagingAlias"("supplierId", "descriptionKey", "unit", "packSize");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingInvoice_submissionKey_key" ON "PackagingInvoice"("submissionKey");

-- CreateIndex
CREATE INDEX "PackagingInvoice_restaurantId_deliveryDate_status_idx" ON "PackagingInvoice"("restaurantId", "deliveryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingInvoice_supplierId_numberKey_key" ON "PackagingInvoice"("supplierId", "numberKey");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingDocument_invoiceId_key" ON "PackagingDocument"("invoiceId");

-- CreateIndex
CREATE INDEX "PackagingDocument_sha256_idx" ON "PackagingDocument"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingLine_invoiceId_position_key" ON "PackagingLine"("invoiceId", "position");

-- AddForeignKey
ALTER TABLE "PackagingProduct" ADD CONSTRAINT "PackagingProduct_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingAlias" ADD CONSTRAINT "PackagingAlias_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingAlias" ADD CONSTRAINT "PackagingAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PackagingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingInvoice" ADD CONSTRAINT "PackagingInvoice_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingInvoice" ADD CONSTRAINT "PackagingInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingDocument" ADD CONSTRAINT "PackagingDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PackagingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingLine" ADD CONSTRAINT "PackagingLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PackagingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingLine" ADD CONSTRAINT "PackagingLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PackagingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "supplier_workspace_required" CHECK ("foodWorkspace" OR "packagingWorkspace");
ALTER TABLE "PackagingDocument" ADD CONSTRAINT "packaging_document_size" CHECK (size > 0 AND size <= 8388608 AND octet_length(bytes) = size);
ALTER TABLE "PackagingLine" ADD CONSTRAINT "packaging_line_values" CHECK ("netPence" >= 0 AND (quantity IS NULL OR quantity > 0) AND ("unitPrice" IS NULL OR "unitPrice" >= 0));
ALTER TABLE "PackagingInvoice" ADD CONSTRAINT "packaging_invoice_values" CHECK (("netPence" IS NULL OR "netPence" >= 0) AND ("vatPence" IS NULL OR "vatPence" >= 0) AND ("grossPence" IS NULL OR "grossPence" >= 0));
ALTER TABLE "PackagingInvoice" ADD CONSTRAINT "packaging_confirmed_net" CHECK (status <> 'CONFIRMED' OR ("confirmedAt" IS NOT NULL AND "netPence" IS NOT NULL));
