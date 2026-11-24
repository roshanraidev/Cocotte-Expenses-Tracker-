-- Additive only: no existing records are updated or backfilled.
CREATE TABLE "KitchenEvent" (
 id TEXT PRIMARY KEY, "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 category TEXT NOT NULL CHECK(category IN ('new','updates','specials','ingredients','announcements')), action TEXT NOT NULL, "recipeId" TEXT, "announcementId" TEXT,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "fanoutAt" TIMESTAMPTZ
);
CREATE INDEX "KitchenEvent_restaurant_created" ON "KitchenEvent"("restaurantId","createdAt" DESC);
CREATE TABLE "KitchenRead" (
 "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "eventId" TEXT NOT NULL REFERENCES "KitchenEvent"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "readAt" TIMESTAMPTZ, PRIMARY KEY("userId","eventId")
);
CREATE TABLE "KitchenPreference" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "inApp" JSONB NOT NULL DEFAULT '{}', push JSONB NOT NULL DEFAULT '{}', "pushEnabled" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE "KitchenAnnouncement" (
 id TEXT PRIMARY KEY, "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 title TEXT NOT NULL, body TEXT NOT NULL, published BOOLEAN NOT NULL DEFAULT true,
 "createdBy" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "KitchenPushSubscription" (
 id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "endpointHash" TEXT NOT NULL UNIQUE, ciphertext TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "KitchenPushDelivery" (
 "eventId" TEXT NOT NULL REFERENCES "KitchenEvent"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "subscriptionId" TEXT NOT NULL REFERENCES "KitchenPushSubscription"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 attempts INT NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 "leaseUntil" TIMESTAMPTZ, "leaseToken" TEXT, "sentAt" TIMESTAMPTZ, failed BOOLEAN NOT NULL DEFAULT false,
 PRIMARY KEY("eventId","subscriptionId")
);
CREATE INDEX "KitchenPushDelivery_pending" ON "KitchenPushDelivery"("nextAttemptAt") WHERE "sentAt" IS NULL AND failed=false;
CREATE FUNCTION cocotte_kitchen_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc JSONB; olddoc JSONB; rid TEXT; recipe TEXT; announcement TEXT; cat TEXT; act TEXT;
BEGIN
 doc:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 olddoc:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 rid:=doc->>'restaurantId';
 IF TG_TABLE_NAME='Recipe' THEN
  recipe:=doc->>'id';
  IF TG_OP<>'DELETE' AND (doc->>'visible')::boolean AND doc->>'archivedAt' IS NULL THEN
   IF TG_OP='INSERT' OR NOT coalesce((olddoc->>'visible')::boolean,false) OR olddoc->>'archivedAt' IS NOT NULL THEN cat:='new'; act:='Recipe published';
   ELSIF (doc->'ingredients',doc->'allergens',doc->'mayContain') IS DISTINCT FROM (olddoc->'ingredients',olddoc->'allergens',olddoc->'mayContain') THEN cat:='ingredients';act:='Ingredients or allergens updated';
   ELSIF (doc-'updatedAt'-'sortOrder') IS DISTINCT FROM (olddoc-'updatedAt'-'sortOrder') THEN cat:='updates';act:='Recipe updated'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='WeeklySpecial' THEN
  recipe:=doc->>'recipeId';
  IF TG_OP='DELETE' AND doc->>'status'='PUBLISHED' OR TG_OP='UPDATE' AND olddoc->>'status'='PUBLISHED' AND doc->>'status'<>'PUBLISHED' THEN cat:='specials';act:='Weekly special removed';
  ELSIF TG_OP<>'DELETE' AND doc->>'status'='PUBLISHED' AND (TG_OP='INSERT' OR (doc-'updatedAt') IS DISTINCT FROM (olddoc-'updatedAt')) THEN cat:='specials';act:=CASE WHEN olddoc->>'status'='PUBLISHED' THEN 'Weekly special changed' ELSE 'Weekly special published' END; END IF;
 ELSIF TG_TABLE_NAME='KitchenAnnouncement' THEN
  announcement:=doc->>'id';
  IF TG_OP<>'DELETE' AND (doc->>'published')::boolean AND (TG_OP='INSERT' OR (doc-'updatedAt') IS DISTINCT FROM (olddoc-'updatedAt')) THEN cat:='announcements';act:='Kitchen announcement'; END IF;
 END IF;
 IF cat IS NOT NULL THEN
  INSERT INTO "KitchenEvent"(id,"restaurantId",category,action,"recipeId","announcementId")
   VALUES(TG_TABLE_NAME||':'||(doc->>'id')||':'||txid_current()::text||':'||cat,rid,cat,act,recipe,announcement) ON CONFLICT DO NOTHING;
 END IF;
 PERFORM pg_notify('cocotte_kitchen',json_build_object('restaurantId',rid)::text);
 RETURN NULL;
END $$;
CREATE TRIGGER kitchen_recipe AFTER INSERT OR UPDATE OR DELETE ON "Recipe" FOR EACH ROW EXECUTE FUNCTION cocotte_kitchen_event();
CREATE TRIGGER kitchen_special AFTER INSERT OR UPDATE OR DELETE ON "WeeklySpecial" FOR EACH ROW EXECUTE FUNCTION cocotte_kitchen_event();
CREATE TRIGGER kitchen_category AFTER INSERT OR UPDATE OR DELETE ON "RecipeType" FOR EACH ROW EXECUTE FUNCTION cocotte_kitchen_event();
CREATE TRIGGER kitchen_settings AFTER INSERT OR UPDATE OR DELETE ON "RecipeFeatureSettings" FOR EACH ROW EXECUTE FUNCTION cocotte_kitchen_event();
CREATE TRIGGER kitchen_announcement AFTER INSERT OR UPDATE OR DELETE ON "KitchenAnnouncement" FOR EACH ROW EXECUTE FUNCTION cocotte_kitchen_event();
CREATE FUNCTION cocotte_kitchen_user_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid TEXT; rid TEXT;
BEGIN
 uid:=CASE WHEN TG_OP='DELETE' THEN OLD."userId" ELSE NEW."userId" END;
 SELECT "restaurantId" INTO rid FROM "User" WHERE id=uid;
 IF rid IS NOT NULL THEN PERFORM pg_notify('cocotte_kitchen',json_build_object('restaurantId',rid)::text); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER kitchen_read AFTER INSERT OR UPDATE OR DELETE ON "KitchenRead" FOR EACH ROW EXECUTE FUNCTION cocotte_kitchen_user_changed();
CREATE TRIGGER kitchen_preferences AFTER INSERT OR UPDATE OR DELETE ON "KitchenPreference" FOR EACH ROW EXECUTE FUNCTION cocotte_kitchen_user_changed();
-- Linked component changes affect the recipe's ingredient composition too.
CREATE FUNCTION cocotte_kitchen_component_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid TEXT; recipe TEXT;
BEGIN
 rid:=CASE WHEN TG_OP='DELETE' THEN OLD."restaurantId" ELSE NEW."restaurantId" END;
 recipe:=CASE WHEN TG_OP='DELETE' THEN OLD."recipeId" ELSE NEW."recipeId" END;
 INSERT INTO "KitchenEvent"(id,"restaurantId",category,action,"recipeId")
 SELECT 'components:'||recipe||':'||txid_current()::text,rid,'ingredients','Linked ingredients updated',recipe
 FROM "Recipe" r JOIN "RecipeType" t ON t.id=r."typeId" AND t."restaurantId"=r."restaurantId"
 WHERE r.id=recipe AND r."restaurantId"=rid AND r.visible=true AND r."archivedAt" IS NULL AND t.visible=true
 ON CONFLICT DO NOTHING;
 PERFORM pg_notify('cocotte_kitchen',json_build_object('restaurantId',rid)::text);
 RETURN NULL;
END $$;
CREATE TRIGGER kitchen_component AFTER INSERT OR UPDATE OR DELETE ON "RecipeComponent" FOR EACH ROW EXECUTE FUNCTION cocotte_kitchen_component_changed();
CREATE INDEX "KitchenEvent_unfanned" ON "KitchenEvent"("createdAt") WHERE "fanoutAt" IS NULL;
CREATE INDEX "KitchenPushSubscription_userId_idx" ON "KitchenPushSubscription"("userId");
