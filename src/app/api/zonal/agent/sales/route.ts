import {revalidatePath} from 'next/cache';
import {db} from '@/lib/db';
import {receiverConfig} from '@/lib/zonal/agent/config';
import {authenticateAgent,limitAgentRequests} from '@/lib/zonal/agent/auth';
import {receiveAgentReport} from '@/lib/zonal/agent/receiver';
import {boundedJson} from '@/lib/zonal/agent/http';
import {AgentError} from '@/lib/zonal/agent/protocol';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 try{
  const config=receiverConfig();authenticateAgent(request,config);limitAgentRequests();
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')||!['identity',null].includes(request.headers.get('content-encoding')))throw new AgentError('JSON_REQUIRED',415);
  const receipt=await receiveAgentReport(db(),config,await boundedJson(request));
  revalidatePath('/admin/integrations/zonal');
  // No Zonal authentication, connection flags, approval or financial mutations here.
  return Response.json(receipt,{headers});
 }catch(error){
  const safe=error instanceof AgentError?error:new AgentError('TRANSFER_TEMPORARILY_UNAVAILABLE',503);
  return Response.json({error:safe.code},{status:safe.status,headers:{...headers,...(safe.status===429?{'Retry-After':'60'}:{})}});
 }
}
