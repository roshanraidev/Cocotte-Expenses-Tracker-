import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 const user=await requireUser(),{id}=await params;
 const rows=await db().$queryRaw<{imageMime:string|null;imageBytes:Uint8Array|null}[]>(Prisma.sql`SELECT "imageMime","imageBytes" FROM "Recipe" WHERE id=${id} AND "restaurantId"=${user.restaurantId} LIMIT 1`);
 const r=rows[0];if(!r?.imageBytes)return new Response(null,{status:404});
 return new Response(new Blob([r.imageBytes],{type:r.imageMime||'image/jpeg'}),{headers:{'Content-Type':r.imageMime||'image/jpeg','Cache-Control':'private, max-age=3600'}});
}