-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CHEF', 'SUPER_USER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PLACED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('WASTE', 'TRANSFER_IN', 'TRANSFER_OUT', 'CORRECTION');

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL DEFAULT 'restaurant',
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSettings" (
    "restaurantId" TEXT NOT NULL,
    "targetBps" INTEGER NOT NULL DEFAULT 2400,
    "warningBps" INTEGER NOT NULL DEFAULT 2200,
    "allocationDays" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantSettings_pkey" PRIMARY KEY ("restaurantId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'restaurant',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CHEF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "WeeklyForecast" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'restaurant',
    "weekStart" DATE NOT NULL,
    "targetBps" INTEGER NOT NULL,
    "warningBps" INTEGER NOT NULL,
    "openingStockPence" BIGINT,
    "expectedClosingStockPence" BIGINT,
    "stockAvailabilityConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "allocationDays" INTEGER NOT NULL DEFAULT 1,
    "purchasesConfirmedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastDay" (
    "id" TEXT NOT NULL,
    "weeklyForecastId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "originalForecastPence" BIGINT NOT NULL,
    "forecastPence" BIGINT NOT NULL,

    CONSTRAINT "ForecastDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySales" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'restaurant',
    "date" DATE NOT NULL,
    "amountPence" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'restaurant',
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "deliverySchedule" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'restaurant',
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "countingUnit" TEXT NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "supplierId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrder" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'restaurant',
    "supplierId" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "expectedDeliveryDate" DATE NOT NULL,
    "receivedDate" DATE,
    "estimatedAmountPence" BIGINT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "lineTotalPence" BIGINT NOT NULL,

    CONSTRAINT "SupplierOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'restaurant',
    "supplierId" TEXT NOT NULL,
    "orderId" TEXT,
    "reference" TEXT NOT NULL,
    "accountingDate" DATE NOT NULL,
    "amountPence" BIGINT NOT NULL,
    "creditForId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'restaurant',
    "date" DATE NOT NULL,
    "status" "StockStatus" NOT NULL DEFAULT 'DRAFT',
    "totalValuePence" BIGINT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountItem" (
    "id" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "countingUnit" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "valuePence" BIGINT NOT NULL,

    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'restaurant',
    "productId" TEXT,
    "accountingDate" DATE NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "valuePence" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL DEFAULT 'restaurant',
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_restaurantId_active_idx" ON "User"("restaurantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyForecast_restaurantId_weekStart_key" ON "WeeklyForecast"("restaurantId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastDay_weeklyForecastId_date_key" ON "ForecastDay"("weeklyForecastId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailySales_restaurantId_date_key" ON "DailySales"("restaurantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_restaurantId_name_key" ON "Supplier"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "Product_restaurantId_active_idx" ON "Product"("restaurantId", "active");

-- CreateIndex
CREATE INDEX "SupplierOrder_restaurantId_expectedDeliveryDate_status_idx" ON "SupplierOrder"("restaurantId", "expectedDeliveryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrderItem_orderId_productId_key" ON "SupplierOrderItem"("orderId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_orderId_key" ON "PurchaseInvoice"("orderId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_restaurantId_accountingDate_idx" ON "PurchaseInvoice"("restaurantId", "accountingDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_supplierId_reference_key" ON "PurchaseInvoice"("supplierId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_restaurantId_date_key" ON "StockCount"("restaurantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountItem_stockCountId_productId_key" ON "StockCountItem"("stockCountId", "productId");

-- CreateIndex
CREATE INDEX "StockAdjustment_restaurantId_accountingDate_idx" ON "StockAdjustment"("restaurantId", "accountingDate");

-- CreateIndex
CREATE INDEX "AuditLog_restaurantId_createdAt_idx" ON "AuditLog"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "RestaurantSettings" ADD CONSTRAINT "RestaurantSettings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyForecast" ADD CONSTRAINT "WeeklyForecast_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastDay" ADD CONSTRAINT "ForecastDay_weeklyForecastId_fkey" FOREIGN KEY ("weeklyForecastId") REFERENCES "WeeklyForecast"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySales" ADD CONSTRAINT "DailySales_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SupplierOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SupplierOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_creditForId_fkey" FOREIGN KEY ("creditForId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database invariants complement server input validation.
ALTER TABLE "Restaurant" ADD CONSTRAINT "single_restaurant" CHECK (id = 'restaurant');
ALTER TABLE "Restaurant" ADD CONSTRAINT "restaurant_locale" CHECK (currency = 'GBP' AND timezone = 'Europe/London');
ALTER TABLE "User" ADD CONSTRAINT "normalized_email" CHECK (email = lower(btrim(email)));
ALTER TABLE "RestaurantSettings" ADD CONSTRAINT "settings_thresholds" CHECK ("targetBps" > 0 AND "targetBps" <= 10000 AND "warningBps" >= 0 AND "warningBps" < "targetBps" AND "allocationDays" BETWEEN 1 AND 7);
ALTER TABLE "WeeklyForecast" ADD CONSTRAINT "week_monday" CHECK (extract(isodow FROM "weekStart") = 1);
ALTER TABLE "WeeklyForecast" ADD CONSTRAINT "week_thresholds" CHECK ("targetBps" > 0 AND "targetBps" <= 10000 AND "warningBps" >= 0 AND "warningBps" < "targetBps" AND "allocationDays" BETWEEN 1 AND 7);
ALTER TABLE "WeeklyForecast" ADD CONSTRAINT "week_stock_nonnegative" CHECK ("openingStockPence" >= 0 AND "expectedClosingStockPence" >= 0);
ALTER TABLE "ForecastDay" ADD CONSTRAINT "forecast_nonnegative" CHECK ("originalForecastPence" >= 0 AND "forecastPence" >= 0);
ALTER TABLE "DailySales" ADD CONSTRAINT "sales_nonnegative" CHECK ("amountPence" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "price_nonnegative" CHECK ("unitCost" >= 0);
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "order_nonnegative" CHECK ("estimatedAmountPence" >= 0);
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "received_date_required" CHECK ((status = 'RECEIVED') = ("receivedDate" IS NOT NULL));
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "order_item_nonnegative" CHECK (quantity >= 0 AND "unitCost" >= 0 AND "lineTotalPence" >= 0);
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "invoice_credit_sign" CHECK (("creditForId" IS NULL AND "amountPence" >= 0) OR ("creditForId" IS NOT NULL AND "amountPence" <= 0 AND "orderId" IS NULL));
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "credit_not_self" CHECK ("creditForId" IS DISTINCT FROM id);
ALTER TABLE "StockCount" ADD CONSTRAINT "stock_sunday" CHECK (extract(isodow FROM date) = 7);
ALTER TABLE "StockCount" ADD CONSTRAINT "stock_confirmation" CHECK ((status = 'CONFIRMED') = ("confirmedAt" IS NOT NULL) AND (status <> 'CONFIRMED' OR "totalValuePence" IS NOT NULL));
ALTER TABLE "StockCount" ADD CONSTRAINT "stock_value_nonnegative" CHECK ("totalValuePence" >= 0);
ALTER TABLE "StockCountItem" ADD CONSTRAINT "count_item_nonnegative" CHECK (quantity >= 0 AND "unitCost" >= 0 AND "valuePence" >= 0);

CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit records are append-only'; END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

CREATE FUNCTION protect_original_forecast() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE start_date date;
BEGIN
  SELECT "weekStart" INTO start_date FROM "WeeklyForecast" WHERE id = NEW."weeklyForecastId";
  IF NEW.date < start_date OR NEW.date > start_date + 6 THEN RAISE EXCEPTION 'Forecast day must belong to its week'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."originalForecastPence" <> OLD."originalForecastPence" OR NEW.date <> OLD.date OR NEW."weeklyForecastId" <> OLD."weeklyForecastId" THEN
      RAISE EXCEPTION 'Original forecast and accounting day are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER original_forecast_immutable BEFORE INSERT OR UPDATE ON "ForecastDay" FOR EACH ROW EXECUTE FUNCTION protect_original_forecast();
