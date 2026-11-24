import {redirect} from 'next/navigation';
import {requirePermission} from '@/lib/auth';
import {db} from '@/lib/db';
import {notices,signalKitchen} from '@/lib/kitchen/service';
export const dynamic='force-dynamic';
export default async function OpenNotification({params}:{params:Promise<{id:string}>}){
 const user=await requirePermission('recipes.view'),{id}=await params;
 if(!(await notices(user,id)).length)return <section className="card"><h1>Update no longer available</h1><p>This content may have been unpublished or your access may have changed.</p></section>;
 const event=await db().kitchenEvent.findUnique({where:{id}});if(!event||event.restaurantId!==user.restaurantId)redirect('/notifications');
 await db().kitchenRead.upsert({where:{userId_eventId:{userId:user.id,eventId:id}},create:{userId:user.id,eventId:id,readAt:new Date()},update:{readAt:new Date()}});await signalKitchen(user.restaurantId);
 redirect(event.recipeId?'/recipes/'+encodeURIComponent(event.recipeId):'/notifications/announcements/'+encodeURIComponent(event.announcementId!));
}
