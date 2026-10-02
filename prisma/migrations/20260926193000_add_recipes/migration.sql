CREATE TABLE "RecipeType" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecipeType_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecipeType_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecipeType_restaurantId_name_key" ON "RecipeType"("restaurantId","name");
CREATE INDEX "RecipeType_restaurantId_visible_sortOrder_idx" ON "RecipeType"("restaurantId","visible","sortOrder");

CREATE TABLE "Recipe" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "imageMime" TEXT,
  "imageBytes" BYTEA,
  "ingredients" JSONB NOT NULL DEFAULT '[]',
  "beforeService" TEXT NOT NULL DEFAULT '',
  "onOrder" TEXT NOT NULL DEFAULT '',
  "allergens" TEXT NOT NULL DEFAULT '',
  "mayContain" TEXT NOT NULL DEFAULT '',
  "suitability" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Recipe_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Recipe_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "RecipeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Recipe_restaurantId_typeId_name_key" ON "Recipe"("restaurantId","typeId","name");
CREATE INDEX "Recipe_restaurantId_visible_typeId_sortOrder_idx" ON "Recipe"("restaurantId","visible","typeId","sortOrder");
