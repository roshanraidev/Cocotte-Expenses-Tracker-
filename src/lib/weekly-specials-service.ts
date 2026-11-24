import 'server-only';
import {Prisma,type PrismaClient} from '@/generated/prisma/client';
import {londonToday} from './dates';
import type {PublishedSpecialCard} from './weekly-specials';
/** One uncached database snapshot, filtered before anything reaches a browser. */
export async function publishedSpecialCards(prisma:PrismaClient|Prisma.TransactionClient,restaurantId:string,today=londonToday()){
 return prisma.$queryRaw<PublishedSpecialCard[]>(Prisma.sql`
  SELECT s.id,s."recipeId",r.name,t.name AS category,(r."imageBytes" IS NOT NULL) AS "hasImage",r."updatedAt"::text AS "imageVersion"
  FROM "WeeklySpecial" s JOIN "Recipe" r ON r.id=s."recipeId" AND r."restaurantId"=s."restaurantId"
  JOIN "RecipeType" t ON t.id=r."typeId" AND t."restaurantId"=r."restaurantId"
  WHERE s."restaurantId"=${restaurantId} AND s.status='PUBLISHED' AND r.visible=true AND t.visible=true AND r."archivedAt" IS NULL
  AND (s."startDate" IS NULL OR s."startDate"<=${today}::date) AND (s."endDate" IS NULL OR s."endDate">=${today}::date)
  AND EXISTS(SELECT 1 FROM "RecipeFeatureSettings" f WHERE f."restaurantId"=s."restaurantId" AND f."weeklySpecialsEnabled"=true)
  ORDER BY s."createdAt",s.id`);
}
