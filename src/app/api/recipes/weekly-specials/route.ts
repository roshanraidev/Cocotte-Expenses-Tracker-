import {currentUser} from '@/lib/auth';
import {can} from '@/lib/permissions';
import {db} from '@/lib/db';
import {publishedSpecialCards} from '@/lib/weekly-specials-service';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store, max-age=0, must-revalidate',Vary:'Cookie'};
export async function GET(){
 try{
 const user=await currentUser();
 if(!user)return Response.json({error:'Sign in to view recipes.'},{status:401,headers});
 if(!can(user,'recipes.view'))return Response.json({error:'Recipe access is required.'},{status:403,headers});
 return Response.json({specials:await publishedSpecialCards(db(),user.restaurantId)},{headers});}
 catch{return Response.json({error:'Weekly specials are temporarily unavailable.'},{status:503,headers});}
}
