import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {can} from '@/lib/permissions';
import {db} from '@/lib/db';
import {kitchenSnapshot,notices,signalKitchen} from '@/lib/kitchen/service';
import {sameOrigin} from '@/lib/kitchen/security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const choices=z.object({new:z.boolean().optional(),updates:z.boolean().optional(),specials:z.boolean().optional(),ingredients:z.boolean().optional(),announcements:z.boolean().optional()}).strict();
const input=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('read'),id:z.string().max(200),read:z.boolean()}),
 z.object({operation:z.literal('preferences'),inApp:choices,push:choices}),
 z.object({operation:z.literal('announcement'),id:z.string().max(100).optional(),title:z.string().trim().min(1).max(150),body:z.string().trim().min(1).max(4000),published:z.boolean()})
]);
export async function GET(){const user=await currentUser();if(!user)return Response.json({error:'Sign in required.'},{status:401});if(!can(user,'recipes.view'))return Response.json({error:'Access denied.'},{status:403});try{return Response.json(await kitchenSnapshot(user),{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}catch{return Response.json({error:'Notifications require the kitchen database migration.'},{status:503});}}
export async function POST(request:Request){
 if(!sameOrigin(request))return new Response(null,{status:403});const user=await currentUser();if(!user)return new Response(null,{status:401});if(!can(user,'recipes.view'))return new Response(null,{status:403});
 if(Number(request.headers.get('content-length')??0)>16000)return new Response(null,{status:413});
 try{const parsed=input.safeParse(await request.json());if(!parsed.success)return Response.json({error:'Please check the submitted fields.'},{status:400});const data=parsed.data;
  if(data.operation==='read'){
   if(!(await notices(user,data.id)).length)return new Response(null,{status:404});
   await db().kitchenRead.upsert({where:{userId_eventId:{userId:user.id,eventId:data.id}},create:{userId:user.id,eventId:data.id,readAt:data.read?new Date():null},update:{readAt:data.read?new Date():null}});
  }else if(data.operation==='preferences')await db().kitchenPreference.upsert({where:{userId:user.id},create:{userId:user.id,inApp:data.inApp,push:data.push},update:{inApp:data.inApp,push:data.push}});
  else{
   if(user.role!=='SUPER_USER')return new Response(null,{status:403});
   if(data.id){const result=await db().kitchenAnnouncement.updateMany({where:{id:data.id,restaurantId:user.restaurantId},data:{title:data.title,body:data.body,published:data.published,updatedAt:new Date()}});if(!result.count)return new Response(null,{status:404});}
   else await db().kitchenAnnouncement.create({data:{id:randomUUID(),restaurantId:user.restaurantId,createdBy:user.id,title:data.title,body:data.body,published:data.published}});
  }
  await signalKitchen(user.restaurantId);return Response.json({ok:true});
 }catch{return Response.json({error:'Unable to save. Please try again.'},{status:503});}
}
