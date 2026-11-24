import {notFound} from 'next/navigation';
import {requirePermission} from '@/lib/auth';
import {db} from '@/lib/db';
export default async function Announcement({params}:{params:Promise<{id:string}>}){
 const user=await requirePermission('recipes.view'),{id}=await params;
 const item=await db().kitchenAnnouncement.findFirst({where:{id,restaurantId:user.restaurantId,published:true}});if(!item)notFound();
 return <article className="card"><p className="eyebrow">Kitchen announcement</p><h1 className="page-title">{item.title}</h1><time>{item.createdAt.toLocaleDateString('en-GB')}</time><p style={{whiteSpace:'pre-wrap',marginTop:20}}>{item.body}</p></article>;
}
