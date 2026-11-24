// Mac uploader only. This process never opens Playwright or approves financial records.
import 'dotenv/config';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {db} from '../../src/lib/db';
import {localAgentConfig} from '../../src/lib/zonal/agent/config';
import {AgentError} from '../../src/lib/zonal/agent/protocol';
import {uploadNext} from '../../src/lib/zonal/agent/uploader';
const exec=promisify(execFile);
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
const args=new Set(process.argv.slice(2));
let prisma:ReturnType<typeof db>|undefined;
try{
 if([...args].some(a=>!['--watch','--status','--retry-blocked'].includes(a)))throw new AgentError('INVALID_COMMAND');
 const config=localAgentConfig();if(!config)throw new AgentError('UPLOAD_DISABLED');
 prisma=db();
 if(args.has('--status')){
  const groups=await prisma.zonalAgentOutbox.groupBy({by:['status','lastError'],where:{agentId:config.agentId},_count:{_all:true}});
  console.info('[zonal-upload]',JSON.stringify(groups.map(g=>({status:g.status,reason:g.lastError,count:g._count._all}))));
 }else{
  // Only this private subprocess output carries the credential; never forward its stderr.
  const result=await exec('/usr/bin/security',['find-generic-password','-s','com.cocotte.zonal-upload','-a',config.account,'-w'],{timeout:10000,maxBuffer:4096});
  const token=result.stdout.trim();if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new AgentError('KEYCHAIN_CREDENTIAL_UNAVAILABLE');
  if(args.has('--retry-blocked'))await prisma.zonalAgentOutbox.updateMany({where:{agentId:config.agentId,status:'BLOCKED'},data:{status:'PENDING',attempts:0,lastError:null,nextAttemptAt:new Date()}});
  do{
   const outcome=await uploadNext(prisma,config,token);console.info('[zonal-upload]',outcome);
   if(outcome==='STOPPED'){console.info('[zonal-upload] Authentication requires operator attention; uploader stopped.');break;}
   if(outcome==='IDLE'||outcome==='RETRY_PENDING'){
    if(!args.has('--watch'))break;
    await new Promise(resolve=>setTimeout(resolve,5000));
   }
  }while(!stopping);
 }
}catch(error){console.error('[zonal-upload]',error instanceof AgentError?error.code:'UPLOAD_UNAVAILABLE');process.exitCode=1;}
finally{await prisma?.$disconnect();}
