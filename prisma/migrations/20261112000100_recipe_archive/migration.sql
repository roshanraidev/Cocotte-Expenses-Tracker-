-- Nullable archive timestamp: NULL means active. Existing recipes are unchanged.
ALTER TABLE "Recipe" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "Recipe_restaurantId_archivedAt_typeId_sortOrder_idx"
ON "Recipe"("restaurantId", "archivedAt", "typeId", "sortOrder");
