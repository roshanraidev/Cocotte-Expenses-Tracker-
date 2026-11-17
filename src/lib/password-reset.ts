import 'server-only';
import type {PrismaClient} from '@/generated/prisma/client';
import {hashToken} from './tokens';
import {hashPassword} from './password';
import {passwordSchema} from './validation';
import {AccessError} from './access';
export async function consumePasswordReset(prisma:PrismaClient,token:string,password:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw new AccessError('This reset link is invalid or expired.');
 passwordSchema.parse(password);const tokenHash=hashToken(token),now=new Date(),key=hashToken('password-reset:'+tokenHash);
 const attempts=await prisma.$queryRaw<{attempts:number}[]>`INSERT INTO "LoginThrottle"("key",attempts,"windowStart") VALUES(${key},1,${now}) ON CONFLICT("key") DO UPDATE SET attempts=CASE WHEN "LoginThrottle"."windowStart"<${new Date(now.getTime()-15*60*1000)} THEN 1 ELSE "LoginThrottle".attempts+1 END,"windowStart"=CASE WHEN "LoginThrottle"."windowStart"<${new Date(now.getTime()-15*60*1000)} THEN ${now} ELSE "LoginThrottle"."windowStart" END RETURNING attempts`;
 if(attempts[0].attempts>8)throw new AccessError('Too many attempts. Ask your Super User for a new reset link.');
 const initial=await prisma.passwordReset.findFirst({where:{tokenHash,consumedAt:null,expiresAt:{gt:now},user:{active:true}}});
 if(!initial)throw new AccessError('This reset link is invalid or expired.');const passwordHash=await hashPassword(password);
 await prisma.$transaction(async tx=>{
  const user=await tx.user.findUniqueOrThrow({where:{id:initial.userId}});await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${user.restaurantId} FOR UPDATE`;
  const current=await tx.user.findUniqueOrThrow({where:{id:user.id}});if(!current.active)throw new AccessError('This reset link is invalid or expired.');
  const used=await tx.passwordReset.updateMany({where:{id:initial.id,tokenHash,consumedAt:null,expiresAt:{gt:new Date()}},data:{consumedAt:new Date()}});if(used.count!==1)throw new AccessError('This reset link is invalid or expired.');
  await tx.user.update({where:{id:user.id},data:{passwordHash}});await tx.session.deleteMany({where:{userId:user.id}});await tx.passwordReset.updateMany({where:{userId:user.id,consumedAt:null},data:{consumedAt:new Date()}});await tx.auditLog.create({data:{restaurantId:user.restaurantId,actorId:user.id,action:'PASSWORD_RESET_COMPLETED',entity:'User',entityId:user.id,after:{reset:true}}});
 });
}
