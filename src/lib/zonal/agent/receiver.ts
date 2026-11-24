import 'server-only';
import type {PrismaClient} from '@/generated/prisma/client';
import {dateValue,londonToday} from '../../dates';
import {validateReport} from '../validation';
import {fingerprint,writePreview} from '../service';
import {salesIdentity} from '../sales-identity';
import {mappedBranch} from '../connection-service';
import type {ReceiverConfig} from './config';
import {AgentError,BRANCH,digest,transferSchema,type Receipt} from './protocol';

export async function receiveAgentReport(prisma:PrismaClient,config:ReceiverConfig,input:unknown,now=new Date()):Promise<Receipt>{
 const parsed=transferSchema.safeParse(input);if(!parsed.success)throw new AgentError('INVALID_REPORT',422);
 const payload=parsed.data;
 if(payload.agentId!==config.agentId)throw new AgentError('WRONG_AGENT',403);
 const capturedAt=new Date(payload.capturedAt);
 if(capturedAt.getTime()>now.getTime()+120000||payload.report.date>=londonToday(now)||payload.report.date>londonToday(capturedAt))throw new AgentError('INVALID_REPORT_DATE',422);
 let report;try{report=validateReport(payload.report,BRANCH,payload.report.date);}catch{throw new AgentError('INVALID_REPORT',422);}
 const bodyHash=digest(payload),hash=fingerprint(report),date=dateValue(report.date),sequence=BigInt(payload.sequence);
 return prisma.$transaction(async tx=>{
  // Shared financial lock order; remote captures cannot race manual entry/approval.
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${config.restaurantId} FOR UPDATE`;
  const actor=await tx.user.findFirst({where:{id:config.actorId,restaurantId:config.restaurantId,active:true,role:'SUPER_USER'},select:{id:true,restaurantId:true,role:true}});
  if(!actor)throw new AgentError('AGENT_AUTHORIZATION_REVOKED',403);
  const restaurant=await tx.restaurant.findUnique({where:{id:config.restaurantId},select:{currency:true,timezone:true}});
  if(!restaurant||restaurant.currency!=='GBP'||restaurant.timezone!=='Europe/London'||await mappedBranch(tx as unknown as PrismaClient,config.restaurantId)!==BRANCH)throw new AgentError('BRANCH_NOT_CONFIGURED',403);
  const existing=await tx.zonalAgentReceipt.findUnique({where:{agentId_transferId:{agentId:config.agentId,transferId:payload.transferId}}});
  if(existing){
   if(existing.restaurantId!==config.restaurantId||existing.bodyHash!==bodyHash)throw new AgentError('TRANSFER_CONFLICT',409);
   return {transferId:payload.transferId,status:existing.status as Receipt['status'],previewId:existing.previewId};
  }
  if(await tx.zonalAgentReceipt.findUnique({where:{agentId_sequence:{agentId:config.agentId,sequence}}}))throw new AgentError('SEQUENCE_CONFLICT',409);
  if(await tx.zonalAgentReceipt.count({where:{agentId:config.agentId,createdAt:{gte:new Date(now.getTime()-60000)}}})>=60)throw new AgentError('RATE_LIMITED',429);
  const previous=await tx.zonalAgentReceipt.findFirst({where:{restaurantId:config.restaurantId,agentId:config.agentId,date},orderBy:{sequence:'desc'}});
  const sale=await tx.dailySales.findUnique({where:{restaurantId_date:{restaurantId:config.restaurantId,date}}});
  const prior=await tx.zonalImport.findFirst({where:{restaurantId:config.restaurantId,date,status:'APPROVED'},orderBy:{completedAt:'desc'}});
  const newest=await tx.zonalImport.findFirst({where:{restaurantId:config.restaurantId,date,status:'PREVIEW'},orderBy:[{createdAt:'desc'},{id:'desc'}]});
  let status:Receipt['status'],previewId:string|null=null;
  if(previous&&previous.sequence>=sequence||newest&&newest.fingerprint!==hash&&newest.createdAt>capturedAt||prior&&prior.fingerprint!==hash&&prior.completedAt&&prior.completedAt>capturedAt){status='STALE';}
  else if(salesIdentity(report.net,hash,sale,prior)==='ALREADY_IMPORTED'){status='ALREADY_IMPORTED';previewId=prior&&sale?.version===prior.salesVersion+1?prior.id:null;}
  else{
   previewId=await writePreview(tx,actor,report,'ZONAL_BROWSER',{capturedAt,reusePending:true});
   const saved=await tx.zonalImport.findUniqueOrThrow({where:{id:previewId}});
   status=now.getTime()-saved.createdAt.getTime()>30*60000?'EXPIRED_REVIEW':newest?.id===previewId?'REUSED_PREVIEW':'STAGED';
  }
  await tx.zonalAgentReceipt.create({data:{restaurantId:config.restaurantId,agentId:config.agentId,transferId:payload.transferId,sequence,date,capturedAt,bodyHash,fingerprint:hash,status,previewId}});
  await tx.auditLog.create({data:{restaurantId:config.restaurantId,actorId:actor.id,action:'ZONAL_AGENT_REPORT_RECEIVED',entity:'ZonalAgentReceipt',entityId:payload.transferId,after:{agentId:config.agentId,date:report.date,capturedAt:payload.capturedAt,status,previewId}}});
  return {transferId:payload.transferId,status,previewId};
 },{maxWait:5000,timeout:10000});
}
