import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';

export type RecipeTypeRow={id:string;name:string;visible:boolean;sortOrder:number;recipeCount:number};
export type Ingredient={name:string;quantity:string;unit:string};
export type RecipeRow={id:string;typeId:string;typeName:string;name:string;visible:boolean;archivedAt:Date|null;sortOrder:number;hasImage:boolean;imageVersion:string;ingredients:Ingredient[];beforeService:string;onOrder:string;allergens:string;mayContain:string;suitability:string};

export async function recipeTypes(restaurantId:string,includeHidden=false){
 return db().$queryRaw<RecipeTypeRow[]>(Prisma.sql`SELECT t.id,t.name,t.visible,t."sortOrder",COUNT(r.id)::int AS "recipeCount" FROM "RecipeType" t LEFT JOIN "Recipe" r ON r."typeId"=t.id AND r."restaurantId"=t."restaurantId" ${includeHidden?Prisma.empty:Prisma.sql`AND r.visible=true AND r."archivedAt" IS NULL`} WHERE t."restaurantId"=${restaurantId} ${includeHidden?Prisma.empty:Prisma.sql`AND t.visible=true`} GROUP BY t.id ORDER BY t."sortOrder",t.name`);
}
export async function recipes(restaurantId:string,includeHidden=false,typeId?:string,archive:'active'|'archived'|'all'='active'){
 return db().$queryRaw<RecipeRow[]>(Prisma.sql`SELECT r.id,r."typeId",t.name AS "typeName",r.name,r.visible,r."archivedAt",r."sortOrder",(r."imageBytes" IS NOT NULL) AS "hasImage",r."updatedAt"::text AS "imageVersion",r.ingredients,r."beforeService",r."onOrder",r.allergens,r."mayContain",r.suitability FROM "Recipe" r JOIN "RecipeType" t ON t.id=r."typeId" AND t."restaurantId"=r."restaurantId" WHERE r."restaurantId"=${restaurantId} ${archive==='all'?Prisma.empty:archive==='archived'?Prisma.sql`AND r."archivedAt" IS NOT NULL`:Prisma.sql`AND r."archivedAt" IS NULL`} ${includeHidden?Prisma.empty:Prisma.sql`AND r.visible=true AND t.visible=true`} ${typeId?Prisma.sql`AND r."typeId"=${typeId}`:Prisma.empty} ORDER BY t."sortOrder",r."sortOrder",r.name`);
}
export async function recipe(restaurantId:string,id:string,includeHidden=false){
 const rows=await db().$queryRaw<RecipeRow[]>(Prisma.sql`SELECT r.id,r."typeId",t.name AS "typeName",r.name,r.visible,r."archivedAt",r."sortOrder",(r."imageBytes" IS NOT NULL) AS "hasImage",r."updatedAt"::text AS "imageVersion",r.ingredients,r."beforeService",r."onOrder",r.allergens,r."mayContain",r.suitability FROM "Recipe" r JOIN "RecipeType" t ON t.id=r."typeId" AND t."restaurantId"=r."restaurantId" WHERE r.id=${id} AND r."restaurantId"=${restaurantId} ${includeHidden?Prisma.empty:Prisma.sql`AND r.visible=true AND t.visible=true`} LIMIT 1`);
 return rows[0]??null;
}

export async function recipeArchiveCounts(restaurantId:string){
 const rows=await db().$queryRaw<{active:number;archived:number}[]>(Prisma.sql`SELECT COUNT(*) FILTER(WHERE "archivedAt" IS NULL)::int AS active,COUNT(*) FILTER(WHERE "archivedAt" IS NOT NULL)::int AS archived FROM "Recipe" WHERE "restaurantId"=${restaurantId}`);
 return rows[0]??{active:0,archived:0};
}
