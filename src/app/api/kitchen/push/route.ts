import {randomUUID} from 'node:crypto';
import {currentUser} from '@/lib/auth';
import {can} from '@/lib/permissions';
import {db} from '@/lib/db';
import {Prisma} from '@/generated/prisma/client';
import {sameOrigin,safeSubscription,seal,endpointHash} from '@/lib/kitchen/security';
import {signalKitchen} from '@/lib/kitchen/service';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!sameOrigin(request))return new Response(null,{status:403});const user=await currentUser();if(!user)return new Response(null,{status:401});if(!can(user,'recipes.view'))return new Response(null,{status:403});
 if(Number(request.headers.get('content-length')??0)>5000)return new Response(null,{status:413});
 try{const data=await request.json();if(data.operation==='disable'){
  await db().$transaction(async tx=>{await tx.kitchenPushSubscription.deleteMany({where:{userId:user.id}});await tx.kitchenPreference.upsert({where:{userId:user.id},create:{userId:user.id,pushEnabled:false},update:{pushEnabled:false}});});
 }else{
  if(!process.env.WEB_PUSH_VAPID_PRIVATE_KEY||!process.env.WEB_PUSH_VAPID_PUBLIC_KEY)return Response.json({error:'Browser push is not configured.'},{status:503});
  const subscription=safeSubscription(data.subscription),hash=endpointHash(subscription.endpoint),ciphertext=seal(subscription);
  await db().$transaction(async tx=>{
   await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`);
   if(await tx.kitchenPushSubscription.count({where:{userId:user.id}})>=5&&!await tx.kitchenPushSubscription.findUnique({where:{endpointHash:hash}}))throw new Error('Device limit reached.');
   const pref=await tx.kitchenPreference.findUnique({where:{userId:user.id}});if(data.operation==='renew'&&!pref?.pushEnabled)throw new Error('Opt in first.');
   // A browser endpoint belongs to one currently opted-in account, never two.
   await tx.kitchenPushSubscription.deleteMany({where:{endpointHash:hash,userId:{not:user.id}}});
   await tx.kitchenPushSubscription.upsert({where:{endpointHash:hash},create:{id:randomUUID(),userId:user.id,endpointHash:hash,ciphertext},update:{ciphertext}});
   await tx.kitchenPreference.upsert({where:{userId:user.id},create:{userId:user.id,pushEnabled:true},update:{pushEnabled:true}});
  });
 }
 await signalKitchen(user.restaurantId);return Response.json({ok:true});
 }catch{return Response.json({error:'Browser notification setup could not be saved.'},{status:400});}
}
