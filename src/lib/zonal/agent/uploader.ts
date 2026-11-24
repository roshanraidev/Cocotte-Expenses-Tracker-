import 'server-only';
import {randomInt,randomUUID} from 'node:crypto';
import type {PrismaClient} from '@/generated/prisma/client';
import {AgentError,receiptSchema,transferSchema} from './protocol';
import {boundedJson} from './http';
export const MAX_ATTEMPTS=10;
export function retryDelay(attempt:number,retryAfter:string|null=null){
 const requested=retryAfter&&/^\d+$/.test(retryAfter)?Math.min(Number(retryAfter)*1000,86400000):0;
 return Math.max(requested,Math.min(3600000,5000*2**Math.min(attempt-1,10))+randomInt(0,1000));
}
export async function claimTransfer(prisma:PrismaClient,agentId:string,now=new Date()){
 return prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cocotte.zonal.outbox'),hashtext(${agentId}))`;
  if(await tx.zonalAgentOutbox.count({where:{agentId,status:'SENDING',leaseUntil:{gt:now}}}))return null;
  await tx.zonalAgentOutbox.updateMany({where:{agentId,attempts:{gte:MAX_ATTEMPTS},OR:[{status:'PENDING'},{status:'SENDING',leaseUntil:{lte:now}}]},data:{status:'BLOCKED',lastError:'RETRY_EXHAUSTED',leaseToken:null,leaseUntil:null}});
  const row=await tx.zonalAgentOutbox.findFirst({where:{agentId,OR:[{status:'PENDING',nextAttemptAt:{lte:now}},{status:'SENDING',leaseUntil:{lte:now}}]},orderBy:{sequence:'asc'}});
  if(!row)return null;
  return tx.zonalAgentOutbox.update({where:{id:row.id},data:{status:'SENDING',leaseToken:randomUUID(),leaseUntil:new Date(now.getTime()+120000),attempts:{increment:1}}});
 });
}
export async function uploadNext(prisma:PrismaClient,config:{agentId:string;url:string},token:string,transport:typeof fetch=fetch,now=new Date()){
 const row=await claimTransfer(prisma,config.agentId,now);if(!row)return 'IDLE' as const;
 const where={id:row.id,status:'SENDING',leaseToken:row.leaseToken};
 let errorCode='NETWORK_UNAVAILABLE',blocked=false,retryAfter:string|null=null;
 try{
  const payload=transferSchema.parse({version:1,agentId:row.agentId,transferId:row.id,sequence:String(row.sequence),capturedAt:row.capturedAt.toISOString(),report:row.payload});
  const response=await transport(config.url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(response.ok){
   const parsed=receiptSchema.safeParse(await boundedJson(response));
   if(!parsed.success||parsed.data.transferId!==row.id)throw new AgentError('INVALID_RECEIPT');
   await prisma.zonalAgentOutbox.updateMany({where,data:{status:'ACKED',leaseToken:null,leaseUntil:null,lastError:null,receipt:parsed.data,acknowledgedAt:now}});
   return 'ACKED' as const;
  }
  // Never echo a server response body, redirect target, URL, token or fetch exception.
  await response.body?.cancel().catch(()=>{});
  retryAfter=response.headers.get('retry-after');
  errorCode=response.status===401||response.status===403?'AUTHORIZATION_FAILED':response.status>=300&&response.status<400?'REDIRECT_REFUSED':response.status===409?'TRANSFER_CONFLICT':response.status===429?'RATE_LIMITED':response.status>=400&&response.status<500?'REPORT_REJECTED':'SERVER_UNAVAILABLE';
  blocked=response.status>=300&&response.status<500&&response.status!==429;
 }catch(error){
  if(error instanceof AgentError&&error.code==='INVALID_RECEIPT'){errorCode='INVALID_RECEIPT';blocked=true;}
  // Malformed immutable local payloads need operator review, not a retry loop.
  else if(error instanceof Error&&error.name==='ZodError'){errorCode='LOCAL_PAYLOAD_INVALID';blocked=true;}
 }
 const authorizationFailed=errorCode==='AUTHORIZATION_FAILED';
 if(row.attempts>=MAX_ATTEMPTS&&!authorizationFailed){blocked=true;errorCode='RETRY_EXHAUSTED';}
 await prisma.zonalAgentOutbox.updateMany({where,data:{status:blocked?'BLOCKED':'PENDING',lastError:errorCode,leaseToken:null,leaseUntil:null,nextAttemptAt:new Date(now.getTime()+retryDelay(row.attempts,retryAfter))}});
 if(errorCode==='AUTHORIZATION_FAILED'){
  await prisma.zonalAgentOutbox.updateMany({where:{agentId:config.agentId,status:'PENDING'},data:{status:'BLOCKED',lastError:errorCode}});
  return 'STOPPED' as const;
 }
 return blocked?'BLOCKED' as const:'RETRY_PENDING' as const;
}
