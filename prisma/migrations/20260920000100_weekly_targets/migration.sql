CREATE TABLE "WeeklyTarget" (
 "id" TEXT PRIMARY KEY, "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "weekStart" DATE NOT NULL CHECK (extract(isodow FROM "weekStart") = 1),
 "originalBps" INTEGER NOT NULL CHECK ("originalBps" BETWEEN 1 AND 10000),
 "targetBps" INTEGER NOT NULL CHECK ("targetBps" BETWEEN 1 AND 10000),
 "source" TEXT NOT NULL CHECK ("source" IN ('DEFAULT','CUSTOM','LEGACY')),
 "version" INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "WeeklyTarget_restaurantId_weekStart_key" ON "WeeklyTarget"("restaurantId","weekStart");
CREATE TABLE "TargetDefault" (
 "id" TEXT PRIMARY KEY, "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE RESTRICT,
 "effectiveFrom" DATE NOT NULL, "targetBps" INTEGER NOT NULL CHECK ("targetBps" BETWEEN 1 AND 10000),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TargetDefault_restaurantId_effectiveFrom_createdAt_idx" ON "TargetDefault"("restaurantId","effectiveFrom","createdAt");
INSERT INTO "TargetDefault" (id,"restaurantId","effectiveFrom","targetBps") SELECT 'initial-' || "restaurantId", "restaurantId", DATE '0001-01-01', "targetBps" FROM "RestaurantSettings";
INSERT INTO "WeeklyTarget" (id,"restaurantId","weekStart","originalBps","targetBps",source,"updatedAt") SELECT 'legacy-' || id,"restaurantId","weekStart","targetBps","targetBps",'LEGACY',"updatedAt" FROM "WeeklyForecast";
CREATE FUNCTION protect_original_target() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Weekly target history cannot be deleted'; END IF;
 IF NEW."originalBps" <> OLD."originalBps" OR NEW."weekStart" <> OLD."weekStart" OR NEW."restaurantId" <> OLD."restaurantId" THEN RAISE EXCEPTION 'Original target and accounting week are immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER target_original_immutable BEFORE UPDATE OR DELETE ON "WeeklyTarget" FOR EACH ROW EXECUTE FUNCTION protect_original_target();
CREATE TRIGGER default_history_immutable BEFORE UPDATE OR DELETE ON "TargetDefault" FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
