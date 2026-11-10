-- Additive only: existing recipes, photos and instructions are untouched.
CREATE UNIQUE INDEX "Recipe_id_restaurantId_key" ON "Recipe"("id", "restaurantId");
CREATE TYPE "WeeklySpecialStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TABLE "RecipeFeatureSettings" (
  "restaurantId" TEXT NOT NULL PRIMARY KEY,
  "weeklySpecialsEnabled" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "RecipeFeatureSettings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "WeeklySpecial" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "restaurantId" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "status" "WeeklySpecialStatus" NOT NULL DEFAULT 'DRAFT',
  "startDate" DATE,
  "endDate" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklySpecial_dates_check" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate"),
  CONSTRAINT "WeeklySpecial_recipeId_restaurantId_fkey" FOREIGN KEY ("recipeId", "restaurantId") REFERENCES "Recipe"("id", "restaurantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WeeklySpecial_restaurantId_status_idx" ON "WeeklySpecial"("restaurantId", "status");
CREATE TABLE "RecipeComponent" (
  "restaurantId" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RecipeComponent_pkey" PRIMARY KEY ("recipeId", "componentId"),
  CONSTRAINT "RecipeComponent_self_check" CHECK ("recipeId" <> "componentId"),
  CONSTRAINT "RecipeComponent_recipeId_restaurantId_fkey" FOREIGN KEY ("recipeId", "restaurantId") REFERENCES "Recipe"("id", "restaurantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecipeComponent_componentId_restaurantId_fkey" FOREIGN KEY ("componentId", "restaurantId") REFERENCES "Recipe"("id", "restaurantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecipeComponent_restaurantId_recipeId_position_idx" ON "RecipeComponent"("restaurantId", "recipeId", "position");
CREATE INDEX "RecipeComponent_componentId_idx" ON "RecipeComponent"("componentId");
