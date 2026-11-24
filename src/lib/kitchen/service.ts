import 'server-only';
import {missingKitchenSchema} from './schema-state';
import {Prisma} from '@/generated/prisma/client';
import {db} from '@/lib/db';
import {publishedSpecialCards} from '@/lib/weekly-specials-service';
import {can} from '@/lib/permissions';
import {enabled,emptyKitchen,type KitchenNotice,type KitchenSnapshot} from './types';
import type {currentUser} from '@/lib/auth';
export type KitchenUser=NonNullable<Awaited<ReturnType<typeof currentUser>>>;
export async function notices(user:KitchenUser,eventId?:string,filterPreferences=false){
 if(!can(user,'recipes.view'))return [];
 return db().$queryRaw<(KitchenNotice&{unreadTotal:number})[]>(Prisma.sql`
 SELECT (count(*) FILTER(WHERE k."readAt" IS NULL) OVER())::int AS "unreadTotal",e.id,e.category,e.action,coalesce(r.name,a.title,'Kitchen update') AS name,
 (k."readAt" IS NOT NULL) AS read,e."createdAt"::text AS "createdAt"
 FROM "KitchenEvent" e JOIN "User" u ON u.id=${user.id} AND u."restaurantId"=e."restaurantId"
 LEFT JOIN "Recipe" r ON r.id=e."recipeId" AND r."restaurantId"=e."restaurantId"
 LEFT JOIN "RecipeType" t ON t.id=r."typeId" AND t."restaurantId"=r."restaurantId"
 LEFT JOIN "KitchenAnnouncement" a ON a.id=e."announcementId" AND a."restaurantId"=e."restaurantId"
 LEFT JOIN "KitchenPreference" pref ON pref."userId"=u.id
 LEFT JOIN "KitchenRead" k ON k."eventId"=e.id AND k."userId"=u.id
 WHERE e."restaurantId"=${user.restaurantId} AND e."createdAt">=u."createdAt"
 AND ((r.visible=true AND r."archivedAt" IS NULL AND t.visible=true) OR a.published=true)
 ${eventId?Prisma.sql`AND e.id=${eventId}`:Prisma.empty}
 ${filterPreferences?Prisma.sql`AND coalesce(pref."inApp"->>e.category,'true')<>'false'`:Prisma.empty}
 ORDER BY e."createdAt" DESC,e.id DESC LIMIT 100`);
}
export async function kitchenSnapshot(user:KitchenUser):Promise<KitchenSnapshot>{
 const specials=await publishedSpecialCards(db(),user.restaurantId);
 let items:(KitchenNotice&{unreadTotal:number})[],pref;
 try{[items,pref]=await Promise.all([notices(user,undefined,true),db().kitchenPreference.findUnique({where:{userId:user.id}})]);}
 catch(error){if(missingKitchenSchema(error))return {...emptyKitchen,available:false,specials};throw error;}
 const preferences={inApp:(pref?.inApp??{}) as KitchenSnapshot['preferences']['inApp'],push:(pref?.push??{}) as KitchenSnapshot['preferences']['push'],pushEnabled:pref?.pushEnabled??false};
 const notifications=items.filter(n=>enabled(preferences.inApp,n.category)).map(({unreadTotal:_,...item})=>{void _;return item;});
 return {available:true,specials,notifications,unread:items[0]?.unreadTotal??0,preferences,pushKey:process.env.WEB_PUSH_VAPID_PUBLIC_KEY&&process.env.WEB_PUSH_VAPID_PRIVATE_KEY&&process.env.WEB_PUSH_VAPID_SUBJECT&&/^[a-f\d]{64}$/i.test(process.env.NOTIFICATIONS_ENCRYPTION_KEY??'')?process.env.WEB_PUSH_VAPID_PUBLIC_KEY:null};
}
export async function signalKitchen(restaurantId:string){await db().$executeRaw(Prisma.sql`SELECT pg_notify('cocotte_kitchen',${JSON.stringify({restaurantId})})`);}
