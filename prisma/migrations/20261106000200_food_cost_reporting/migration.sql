-- Additive reporting ledger only. Existing financial tables/formulas are untouched.
CREATE TABLE "FoodCostPeriod" (
 "id" TEXT PRIMARY KEY,
 "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "from" DATE NOT NULL, "to" DATE NOT NULL,
 "category" TEXT NOT NULL DEFAULT 'FOOD' CHECK ("category"='FOOD'),
 "payload" JSONB NOT NULL CHECK (jsonb_typeof("payload")='object'),
 "fingerprint" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version">0),
 "approvedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("to">="from" AND "to"-"from"<366)
);
CREATE UNIQUE INDEX "FoodCostPeriod_restaurantId_from_to_category_key" ON "FoodCostPeriod"("restaurantId","from","to","category");
CREATE TABLE "FoodCostPreview" (
 "id" TEXT PRIMARY KEY,
 "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "from" DATE NOT NULL, "to" DATE NOT NULL,
 "category" TEXT NOT NULL DEFAULT 'FOOD' CHECK ("category"='FOOD'),
 "payload" JSONB NOT NULL CHECK (jsonb_typeof("payload")='object'),
 "fingerprint" TEXT NOT NULL, "expectedVersion" INTEGER NOT NULL CHECK ("expectedVersion">=0),
 "status" TEXT NOT NULL DEFAULT 'PREVIEW' CHECK ("status" IN ('PREVIEW','APPROVED','CANCELLED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
 "periodId" TEXT REFERENCES "FoodCostPeriod"("id") ON DELETE RESTRICT,
 CHECK ("to">="from" AND "to"-"from"<366)
);
CREATE INDEX "FoodCostPreview_restaurantId_createdAt_idx" ON "FoodCostPreview"("restaurantId","createdAt");
