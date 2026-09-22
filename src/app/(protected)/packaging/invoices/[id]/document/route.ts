import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const user=await requireUser();const {id}=await params;const document=await db().packagingDocument.findFirst({where:{invoiceId:id,invoice:{restaurantId:user.restaurantId}}});if(!document)return new Response('Not found',{status:404});return new Response(new Uint8Array(document.bytes),{headers:{'Content-Type':document.mime,'Content-Length':String(document.size),'Content-Disposition':`attachment; filename="${document.filename.replace(/["\r\n]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});}
