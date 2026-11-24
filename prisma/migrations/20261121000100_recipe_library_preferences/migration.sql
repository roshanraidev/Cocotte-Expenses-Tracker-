-- Additive display preferences only. No recipe/financial data updates or deletions.
CREATE UNIQUE INDEX "User_id_restaurantId_key" ON "User"("id", "restaurantId");
CREATE TABLE "RestaurantRecipeLibrary" (
 "restaurantId" TEXT PRIMARY KEY,
 "recipeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "revision" INTEGER NOT NULL DEFAULT 0,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "RestaurantRecipeLibrary_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "UserRecipeLibrary" (
 "userId" TEXT PRIMARY KEY,
 "restaurantId" TEXT NOT NULL,
 "personalOrder" JSONB,
 "filters" JSONB NOT NULL DEFAULT '{}',
 "orderRevision" INTEGER NOT NULL DEFAULT 0,
 "filtersRevision" INTEGER NOT NULL DEFAULT 0,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "UserRecipeLibrary_userId_restaurantId_fkey" FOREIGN KEY ("userId", "restaurantId") REFERENCES "User"("id", "restaurantId") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "UserRecipeLibrary_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "UserRecipeLibrary_restaurantId_idx" ON "UserRecipeLibrary"("restaurantId");
CREATE UNIQUE INDEX "UserRecipeLibrary_userId_restaurantId_key" ON "UserRecipeLibrary"("userId", "restaurantId");
