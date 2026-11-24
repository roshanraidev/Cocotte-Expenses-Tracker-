import 'server-only';
import {randomUUID,createHash} from 'node:crypto';
import * as webpush from 'web-push';
import {Prisma} from '@/generated/prisma/client';
import {db} from '@/lib/db';
import {resolveAccess} from '@/lib/access';
import {notices} from './service';
import {enabled,type Choices} from './types';
import {unseal} from './security';
/** Durable database leases; a crashed worker resumes without losing queued work. */
export async function notificationTick(send=webpush.sendNotification){
 const p=db();
 await p.$transaction(async tx=>{
  const events=await tx.$queryRaw<{id:string;restaurantId:string;createdAt:Date}[]>(Prisma.sql`SELECT id,"restaurantId","createdAt" FROM "KitchenEvent" WHERE "fanoutAt" IS NULL ORDER BY "createdAt" LIMIT 25 FOR UPDATE SKIP LOCKED`);
  for(const event of events){
   await tx.$executeRaw(Prisma.sql`INSERT INTO "KitchenPushDelivery"("eventId","subscriptionId") SELECT ${event.id},s.id FROM "KitchenPushSubscription" s JOIN "User" u ON u.id=s."userId" JOIN "KitchenPreference" pref ON pref."userId"=u.id WHERE u.active=true AND u."restaurantId"=${event.restaurantId} AND u."createdAt"<=${event.createdAt} AND pref."pushEnabled"=true AND s."createdAt"<=${event.createdAt} ON CONFLICT DO NOTHING`);
   await tx.kitchenEvent.update({where:{id:event.id},data:{fanoutAt:new Date()}});
  }
 });
 const token=randomUUID();
 const jobs=await p.$queryRaw<{eventId:string;subscriptionId:string;attempts:number}[]>(Prisma.sql`UPDATE "KitchenPushDelivery" SET "leaseToken"=${token},"leaseUntil"=now()+interval '45 seconds',attempts=attempts+1 WHERE ("eventId","subscriptionId") IN (SELECT "eventId","subscriptionId" FROM "KitchenPushDelivery" WHERE "sentAt" IS NULL AND failed=false AND "nextAttemptAt"<=now() AND ("leaseUntil" IS NULL OR "leaseUntil"<now()) ORDER BY "nextAttemptAt" LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING "eventId","subscriptionId",attempts`);
 for(const job of jobs){
  const identity={eventId:job.eventId,subscriptionId:job.subscriptionId,leaseToken:token};
  try{
   const sub=await p.kitchenPushSubscription.findUnique({where:{id:job.subscriptionId}});if(!sub)continue;
   const [user,pref]=await Promise.all([p.user.findUnique({where:{id:sub.userId}}),p.kitchenPreference.findUnique({where:{userId:sub.userId}})]);
   const actor=user?.active?await resolveAccess(p,user):null,event=actor?(await notices(actor,job.eventId))[0]:null;
   if(!actor||!event||!pref?.pushEnabled||!enabled(pref.push as Choices,event.category)){await p.kitchenPushDelivery.updateMany({where:identity,data:{failed:true,leaseUntil:null}});continue;}
   await send(unseal(sub.ciphertext),JSON.stringify({title:'Cocotte Kitchen Intelligence',body:'A kitchen update is available. Sign in to view.',id:event.id,url:'/notifications/open/'+encodeURIComponent(event.id)}),{TTL:3600,timeout:15000,topic:createHash('sha256').update(event.id).digest('base64url').slice(0,32)});
   await p.kitchenPushDelivery.updateMany({where:identity,data:{sentAt:new Date(),leaseUntil:null}});
  }catch(error){
   const status=(error as {statusCode?:number}).statusCode;
   if(status===404||status===410)await p.kitchenPushSubscription.deleteMany({where:{id:job.subscriptionId}});
   else await p.kitchenPushDelivery.updateMany({where:identity,data:{leaseUntil:null,failed:job.attempts>=5,nextAttemptAt:new Date(Date.now()+Math.min(3600000,30000*2**job.attempts))}});
   // Never log provider errors: they may contain endpoints or subscription keys.
  }
 }
 return jobs.length;
}
export function configurePush(){const {WEB_PUSH_VAPID_SUBJECT:subject,WEB_PUSH_VAPID_PUBLIC_KEY:pub,WEB_PUSH_VAPID_PRIVATE_KEY:priv}=process.env;if(!subject||!pub||!priv)throw new Error('Configure VAPID keys before starting the notification worker.');webpush.setVapidDetails(subject,pub,priv);}
