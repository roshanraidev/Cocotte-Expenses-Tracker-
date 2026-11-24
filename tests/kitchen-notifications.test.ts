import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {seal,unseal,safeSubscription,sameOrigin} from '../src/lib/kitchen/security';
import {missingKitchenSchema} from '../src/lib/kitchen/schema-state';
import {enabled} from '../src/lib/kitchen/types';
vi.mock('server-only',()=>({}));
const auth=vi.hoisted(()=>({requirePermission:vi.fn()}));vi.mock('@/lib/auth',()=>auth);
import {requireRecipePublisher} from '../src/lib/kitchen/recipe-permissions';
describe('Kitchen security',()=>{
 it('recognises only missing kitchen tables, including Prisma 7 raw adapter errors',()=>{
  expect(missingKitchenSchema({code:'P2010',meta:{driverAdapterError:{cause:{originalCode:'42P01',table:'KitchenEvent'}}}})).toBe(true);
  expect(missingKitchenSchema({code:'P2021',meta:{modelName:'KitchenPreference'}})).toBe(true);
  expect(missingKitchenSchema({code:'P2021',meta:{modelName:'User'}})).toBe(false);
  expect(missingKitchenSchema({code:'P2010',meta:{driverAdapterError:{cause:{originalCode:'42501',table:'KitchenEvent'}}}})).toBe(false);
 });
 beforeEach(()=>{process.env.NOTIFICATIONS_ENCRYPTION_KEY='ab'.repeat(32);});
 it('authenticates encrypted push subscriptions and never falls back to plaintext',()=>{const value={endpoint:'https://fcm.googleapis.com/test',keys:{auth:'secret'}};const encrypted=seal(value);expect(encrypted).not.toContain('secret');expect(unseal(encrypted)).toEqual(value);expect(seal(value)).not.toBe(encrypted);const bytes=Buffer.from(encrypted,'base64');bytes[15]^=1;expect(()=>unseal(bytes.toString('base64'))).toThrow();delete process.env.NOTIFICATIONS_ENCRYPTION_KEY;expect(()=>seal(value)).toThrow();});
 it('rejects SSRF targets and invalid push keys',()=>{for(const endpoint of ['http://localhost/push','https://127.0.0.1/push','https://evil.test/push','https://fcm.googleapis.com:444/push'])expect(()=>safeSubscription({endpoint,keys:{p256dh:'a'.repeat(87),auth:'a'.repeat(22)}})).toThrow();expect(safeSubscription({endpoint:'https://fcm.googleapis.com/push',keys:{p256dh:'a'.repeat(87),auth:'a'.repeat(22)}}).endpoint).toContain('googleapis');});
 it('rejects cross-site credentialed writes',()=>{expect(sameOrigin(new Request('https://cocotte.test/api',{headers:{Origin:'https://evil.test'}}))).toBe(false);expect(sameOrigin(new Request('https://cocotte.test/api',{headers:{Origin:'https://cocotte.test'}}))).toBe(true);});
 it('respects independent category choices',()=>{expect(enabled({},'specials')).toBe(true);expect(enabled({specials:false},'specials')).toBe(false);expect(enabled({specials:false},'new')).toBe(true);});
 it('only lets Super Users publish regardless of assigned edit permission',async()=>{auth.requirePermission.mockResolvedValue({role:'CHEF',permissions:['recipes.edit']});await expect(requireRecipePublisher('recipes.edit')).rejects.toThrow('Only Super');auth.requirePermission.mockResolvedValue({role:'SUPER_USER'});expect((await requireRecipePublisher('recipes.edit')).role).toBe('SUPER_USER');});
});
it('records recipe and special events transactionally without rewriting existing data',async()=>{
 const p=new PGlite();try{
 await p.exec(`CREATE TABLE "Restaurant"(id TEXT PRIMARY KEY);CREATE TABLE "User"(id TEXT PRIMARY KEY,"restaurantId" TEXT);CREATE TABLE "Recipe"(id TEXT PRIMARY KEY,"restaurantId" TEXT,visible BOOLEAN,"archivedAt" TIMESTAMPTZ,ingredients JSONB,allergens TEXT,"mayContain" TEXT,name TEXT,"updatedAt" TIMESTAMPTZ,"typeId" TEXT DEFAULT 't');CREATE TABLE "WeeklySpecial"(id TEXT PRIMARY KEY,"restaurantId" TEXT,"recipeId" TEXT,status TEXT,"updatedAt" TIMESTAMPTZ);CREATE TABLE "RecipeType"(id TEXT,"restaurantId" TEXT,visible BOOLEAN DEFAULT true);CREATE TABLE "RecipeFeatureSettings"("restaurantId" TEXT);CREATE TABLE "RecipeComponent"("restaurantId" TEXT,"recipeId" TEXT);INSERT INTO "Restaurant" VALUES('r');INSERT INTO "User" VALUES('u','r');INSERT INTO "RecipeType" VALUES('t','r',true);`);
 await p.exec(readFileSync('prisma/migrations/20261122000100_kitchen_notifications/migration.sql','utf8'));
 await p.exec(`INSERT INTO "Recipe" VALUES('one','r',false,NULL,'[]','', '', 'Soup',now());`);
 expect((await p.query('SELECT * FROM "KitchenEvent"')).rows).toHaveLength(0);
 await p.exec(`UPDATE "Recipe" SET visible=true WHERE id='one';UPDATE "Recipe" SET allergens='Milk' WHERE id='one';INSERT INTO "WeeklySpecial" VALUES('s','r','one','PUBLISHED',now());`);
 expect((await p.query<{category:string}>('SELECT category FROM "KitchenEvent" ORDER BY "createdAt"')).rows.map(x=>x.category)).toEqual(['new','ingredients','specials']);
 await p.exec(`UPDATE "WeeklySpecial" SET status='DRAFT' WHERE id='s';`);expect((await p.query<{action:string}>(`SELECT action FROM "KitchenEvent" WHERE action='Weekly special removed'`)).rows).toHaveLength(1);
 await p.exec('BEGIN');await p.exec(`UPDATE "Recipe" SET name='Rolled back' WHERE id='one'`);await p.exec('ROLLBACK');expect((await p.query(`SELECT name FROM "Recipe"`)).rows).toEqual([{name:'Soup'}]);
 await p.exec(`INSERT INTO "RecipeComponent" VALUES('r','one')`);expect((await p.query(`SELECT action FROM "KitchenEvent" WHERE action='Linked ingredients updated'`)).rows).toHaveLength(1);
 await p.exec(`INSERT INTO "KitchenRead" VALUES('u',(SELECT id FROM "KitchenEvent" LIMIT 1),now())`);await expect(p.exec(`INSERT INTO "KitchenRead" SELECT * FROM "KitchenRead"`)).rejects.toThrow();
 }finally{await p.close();}
},20000);
