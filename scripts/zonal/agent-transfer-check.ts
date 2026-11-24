// ISOLATED ONLY. Two databases in a new temporary PostgreSQL cluster; no real Zonal/HTTPS.
import {PrismaClient} from '../../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {Pool} from 'pg';
import {execFile,spawn,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {receiveAgentReport} from '../../src/lib/zonal/agent/receiver';
import {authenticateAgent} from '../../src/lib/zonal/agent/auth';
import {boundedJson} from '../../src/lib/zonal/agent/http';
import {uploadNext,claimTransfer} from '../../src/lib/zonal/agent/uploader';
import {enqueueAgentReport} from '../../src/lib/zonal/agent/outbox';
import {BRANCH,AGENT_PATH,type Transfer} from '../../src/lib/zonal/agent/protocol';
import {fetchAndPreview,previewImport,resolveImport} from '../../src/lib/zonal/service';
import {startDateBatch,runBatch} from '../../src/lib/zonal/batch';
import {previewAssessment} from '../../src/lib/zonal/approval-data';
import {validateReport} from '../../src/lib/zonal/validation';
import {encryptCredentials} from '../../src/lib/zonal/crypto';
import {saveWeeklyForecast} from '../../src/lib/sales-service';
import {addDays,londonToday,mondayOf,dateValue} from '../../src/lib/dates';
const exec=promisify(execFile),root=await mkdtemp(join(tmpdir(),'cocotte-agent-only-')),cluster=join(root,'pg');
const url='postgresql://agent_test@127.0.0.1:51947/postgres',remoteUrl='postgresql://agent_test@127.0.0.1:51947/agent_remote';
if([url,remoteUrl].includes(process.env.DATABASE_URL??''))throw new Error('An isolated database is required.');
let app:ChildProcess|undefined;
let started=false,local:PrismaClient|undefined,remote:PrismaClient|undefined;
const now=new Date(),date=addDays(londonToday(),-1),second=addDays(date,-1),third=addDays(date,-2),agentId='mac-fixture-v1',token=randomBytes(32).toString('base64url');
const sourceActor={id:'source-admin',restaurantId:'restaurant',role:'SUPER_USER' as const};
const targetActor={id:'target-admin',restaurantId:'restaurant',role:'SUPER_USER' as const};
const config={agentId,tokenHash:createHash('sha256').update(token).digest('hex'),restaurantId:targetActor.restaurantId,actorId:targetActor.id,origin:'https://mrcocotte.com',trustProxy:false};
function report(d=date,m=1){return {branch:BRANCH as typeof BRANCH,date:d,currency:'GBP' as const,gross:`${120*m}.00`,discount:'0.00',vat:`${20*m}.00`,net:`${100*m}.00`,food:`${70*m}.00`,drink:`${20*m}.00`,specials:`${10*m}.00`,covers:'10',transactions:'12'};}
function transfer(sequence:number,d=date,m=1,capturedAt=new Date()){return {version:1 as const,agentId,transferId:randomUUID(),sequence:String(sequence),capturedAt:capturedAt.toISOString(),report:report(d,m)};}
try{
 await exec('initdb',['-D',cluster,'-A','trust','-U','agent_test','--no-locale']);
 await exec('pg_ctl',['-D',cluster,'-l',join(root,'pg.log'),'-o',`-p 51947 -h 127.0.0.1 -k ${root}`,'-w','start']);started=true;
 const admin=new Pool({connectionString:url});try{await admin.query('CREATE DATABASE agent_remote');}finally{await admin.end();}
 for(const connectionString of [url,remoteUrl]){
  const pool=new Pool({connectionString});try{for(const migration of (await readdir('prisma/migrations')).sort())if(migration!=='migration_lock.toml')await pool.query(await readFile('prisma/migrations/'+migration+'/migration.sql','utf8'));}finally{await pool.end();}
 }
 local=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:5})});remote=new PrismaClient({adapter:new PrismaPg({connectionString:remoteUrl,max:5})});
 process.env.DATABASE_URL=url;process.env.ZONAL_AGENT_UPLOAD_ENABLED='true';process.env.ZONAL_AGENT_ID=agentId;process.env.ZONAL_AGENT_LOCAL_RESTAURANT_ID=sourceActor.restaurantId;process.env.ZONAL_AGENT_KEYCHAIN_ACCOUNT='test-not-read';process.env.ZONAL_AGENT_UPLOAD_URL='https://mrcocotte.com'+AGENT_PATH;process.env.ZONAL_CREDENTIALS_KEY=randomBytes(32).toString('base64');
 for(const [db,actor] of [[local,sourceActor],[remote,targetActor]] as const){
  await db.restaurant.create({data:{id:actor.restaurantId,name:'Synthetic transfer isolation',settings:{create:{}}}});
  await db.user.create({data:{...actor,name:'Synthetic administrator',email:actor.id+'@example.test',passwordHash:'unused-test-hash'}});
  await db.zonalConnection.create({data:{restaurantId:actor.restaurantId,branch:BRANCH,...(db===local?{encryptedCredentials:encryptCredentials(actor.restaurantId,{username:'fixture-only',password:'fixture-only'})}:{})}});
 }
 const remoteDb=remote,localDb=local;
 const count=await local.zonalAgentOutbox.count();
 await assert.rejects(local.$transaction(async tx=>{await enqueueAgentReport(tx,sourceActor.restaurantId,validateReport(report(),BRANCH,date),now);throw new Error('rollback');}));
 assert.equal(await local.zonalAgentOutbox.count(),count);
 await previewImport(local,sourceActor,report());assert.equal(await local.zonalAgentOutbox.count(),count); // Manual fallback never uploads.
 await fetchAndPreview(local,sourceActor,date,async()=>({code:'REPORT_EXTRACTED',loginVerified:true,report:report()}));
 assert.equal(await local.zonalAgentOutbox.count(),1);assert.equal(await local.dailySales.count(),0);
 const server:typeof fetch=async(_url,options)=>{
  const request=new Request('https://mrcocotte.com'+AGENT_PATH,options as RequestInit);authenticateAgent(request,config);
  return Response.json(await receiveAgentReport(remoteDb,config,await boundedJson(request)));
 };
 const lost:typeof fetch=async(url,options)=>{await server(url,options);throw new Error('simulated lost acknowledgement');};
 const sender={agentId,url:'https://mrcocotte.com'+AGENT_PATH};
 assert.equal(await uploadNext(local,sender,token,lost),'RETRY_PENDING');assert.equal(await remote.zonalAgentReceipt.count(),1);assert.equal(await remote.zonalImport.count(),1);assert.equal(await remote.dailySales.count(),0);
 await local.zonalAgentOutbox.updateMany({data:{nextAttemptAt:new Date(0)}});
 assert.equal(await uploadNext(local,sender,token,server),'ACKED');assert.equal(await remote.zonalImport.count(),1);assert.equal(await remote.zonalAgentReceipt.count(),1);
 const row=await local.zonalAgentOutbox.findFirstOrThrow();
 const original={version:1,agentId,transferId:row.id,sequence:String(row.sequence),capturedAt:row.capturedAt.toISOString(),report:row.payload} as Transfer;
 const concurrent=await Promise.all(Array.from({length:3},()=>receiveAgentReport(remoteDb,config,original)));
 assert(concurrent.every(r=>r.previewId===concurrent[0].previewId));assert.equal(await remote.zonalImport.count(),1);
 await assert.rejects(receiveAgentReport(remote,config,{...original,report:report(date,2)}),/TRANSFER_CONFLICT/);
 await assert.rejects(receiveAgentReport(remote,config,{...original,transferId:randomUUID()}),/SEQUENCE_CONFLICT/);
 await assert.rejects(receiveAgentReport(remote,config,{...original,restaurantId:sourceActor.restaurantId}),/INVALID_REPORT/);
 await assert.rejects(receiveAgentReport(remote,{...config,restaurantId:'foreign-restaurant'},original),/AGENT_AUTHORIZATION_REVOKED/);
 const preview=await remote.zonalImport.findFirstOrThrow();assert.equal(preview.actorId,targetActor.id);assert.equal(preview.salesVersion,0);
 assert((await previewAssessment(remote,targetActor.restaurantId,preview)).issues.some(i=>i.code==='MISSING_FORECAST'));
 await assert.rejects(resolveImport(remote,targetActor,preview.id,false,false,'Synthetic approval'),/forecast/);
 const weeks=new Set([mondayOf(date),mondayOf(second),mondayOf(third)]);
 for(const week of weeks)await saveWeeklyForecast(remote,targetActor,{weekStart:week,version:0,amounts:Array(7).fill(10000n),reason:'Isolated forecast'});
 const forecasts=await remote.forecastDay.findMany({orderBy:{date:'asc'}});
 await resolveImport(remote,targetActor,preview.id,false,false,'Explicit synthetic approval');
 assert.equal(await remote.dailySales.count(),1);const approved=await remote.dailySales.findFirstOrThrow();
 await resolveImport(remote,targetActor,preview.id,false,false,'Repeated synthetic approval');assert.deepEqual(await remote.dailySales.findFirstOrThrow(),approved);
 const same=await receiveAgentReport(remote,config,transfer(100,date));assert.equal(same.status,'ALREADY_IMPORTED');assert.equal(await remote.zonalImport.count(),1);
 const correction=await receiveAgentReport(remote,config,transfer(101,date,2,new Date(Date.now()+10000)));assert.equal(correction.status,'STAGED');
 await assert.rejects(resolveImport(remote,targetActor,correction.previewId!,false,false,'No silent overwrite'),/Explicit confirmation/);assert.deepEqual(await remote.dailySales.findFirstOrThrow(),approved);
 const older=await receiveAgentReport(remote,config,transfer(99,date,3));assert.equal(older.status,'STALE');
 await remote.dailySales.create({data:{restaurantId:targetActor.restaurantId,date:dateValue(second),amountPence:1234n}});
 const manual=await remote.dailySales.findUniqueOrThrow({where:{restaurantId_date:{restaurantId:targetActor.restaurantId,date:dateValue(second)}}});
 const manualReport=await receiveAgentReport(remote,config,transfer(102,second));
 await assert.rejects(resolveImport(remote,targetActor,manualReport.previewId!,false,false,'Manual safeguard'),/Explicit confirmation/);
 assert.deepEqual(await remote.dailySales.findUniqueOrThrow({where:{id:manual.id}}),manual);
 await resolveImport(remote,targetActor,manualReport.previewId!,false,true,'Explicit isolated manual correction');assert.equal(await remote.dailySales.count(),2);
 const expiredInput=transfer(103,third,1,new Date(Date.now()-7200000));const expired=await receiveAgentReport(remote,config,expiredInput);assert.equal(expired.status,'EXPIRED_REVIEW');
 const expiry=await remote.zonalImport.findUniqueOrThrow({where:{id:expired.previewId!}});assert.equal(expiry.createdAt.toISOString(),expiredInput.capturedAt);
 await receiveAgentReport(remote,config,expiredInput);assert.deepEqual(await remote.zonalImport.findUniqueOrThrow({where:{id:expiry.id}}),expiry);
 await assert.rejects(resolveImport(remote,targetActor,expiry.id,false,false,'Cannot refresh by uploading'),/expired/);
 await assert.rejects(receiveAgentReport(remote,config,transfer(104,date,1,new Date(Date.now()+3600000))),/INVALID_REPORT_DATE/);
 const clean=await receiveAgentReport(remote,config,transfer(105,third));assert.equal(clean.status,'STAGED');assert.notEqual(clean.previewId,expiry.id);
 // Revocation is enforced even when a receipt already exists.
 await remote.user.update({where:{id:targetActor.id},data:{active:false}});await assert.rejects(receiveAgentReport(remote,config,original),/AUTHORIZATION_REVOKED/);await remote.user.update({where:{id:targetActor.id},data:{active:true}});
 // An unchanged LOCAL approved day must still queue a fresh capture for a different database.
 await local.dailySales.create({data:{restaurantId:sourceActor.restaurantId,date:dateValue(date),amountPence:10000n}});
 const localPreview=await local.zonalImport.findFirstOrThrow({where:{source:'ZONAL_BROWSER'}});await local.zonalImport.update({where:{id:localPreview.id},data:{status:'APPROVED',completedAt:new Date()}});
 await local.zonalConnection.update({where:{restaurantId:sourceActor.restaurantId},data:{lastAttemptAt:new Date(0)}});
 const batch=await startDateBatch(local,sourceActor,[date]);await runBatch(local,sourceActor,batch,async(_r,_c,dates,onDay)=>{await onDay(dates[0],{code:'REPORT_EXTRACTED',loginVerified:true,report:report()});return {code:'AUTHENTICATED',loginVerified:true};});
 assert.equal(await local.zonalSyncDay.count({where:{batchId:batch,status:'UNCHANGED'}}),1);assert.equal(await local.zonalAgentOutbox.count(),2);
 const claims=await Promise.all([claimTransfer(localDb,agentId),claimTransfer(localDb,agentId)]);assert.equal(claims.filter(Boolean).length,1);
 const lease=claims.find(Boolean)!;await local.zonalAgentOutbox.update({where:{id:lease.id},data:{leaseUntil:new Date(0)}});
 const reclaimed=await claimTransfer(localDb,agentId);assert.equal(reclaimed!.id,lease.id);assert.notEqual(reclaimed!.leaseToken,lease.leaseToken);
 assert.equal((await local.zonalAgentOutbox.updateMany({where:{id:lease.id,status:'SENDING',leaseToken:lease.leaseToken},data:{status:'ACKED'}})).count,0);

 assert.deepEqual(await remote.forecastDay.findMany({orderBy:{date:'asc'}}),forecasts);
 const canonical=await remote.dailySales.groupBy({by:['restaurantId','date'],_count:{_all:true}});assert(canonical.every(row=>row._count._all===1));
 // Exercise the built Next endpoint through a local reverse-proxy-shaped request.
 // The socket is loopback only; no production DNS/network/database is used.
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3182'],{env:{...process.env,DATABASE_URL:remoteUrl,ZONAL_AGENT_UPLOAD_ENABLED:'false',ZONAL_AGENT_ID:agentId,ZONAL_AGENT_TOKEN_SHA256:config.tokenHash,ZONAL_AGENT_RESTAURANT_ID:targetActor.restaurantId,ZONAL_AGENT_ACTOR_ID:targetActor.id,ZONAL_AGENT_RECEIVER_ORIGIN:config.origin,ZONAL_AGENT_TRUST_PROXY:'true'},stdio:'ignore'});
 for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:3182/login')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 const httpPayload=transfer(1000,addDays(date,-3));
 const send=()=>fetch('http://127.0.0.1:3182'+AGENT_PATH,{method:'POST',headers:{Host:'mrcocotte.com','X-Forwarded-Proto':'https',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(httpPayload)});
 const firstHttp=await send();const firstReceipt=await firstHttp.json();assert.equal(firstHttp.status,200,JSON.stringify(firstReceipt));
 const repeatHttp=await send();assert.equal(repeatHttp.status,200);assert.deepEqual(await repeatHttp.json(),firstReceipt);assert.equal(await remote.dailySales.count(),2);
 console.log('PASS built Next endpoint: trusted reverse-proxy shape, upload/replay acknowledgements and no automatic sales changes. Loopback HTTP simulation only; live HTTPS remains unverified.');
 console.log('PASS: isolated Mac/production databases; atomic rollback/outbox hooks; lost acknowledgements; concurrent receipts/leases; idempotent previews; branch/restaurant/actor isolation; revocation; missing forecasts; explicit approval/manual correction; stale ordering; 30-minute expiry; unchanged-local captures; forecasts unchanged. No external requests or real records used.');
}finally{
 app?.kill('SIGTERM');
 await local?.$disconnect();await remote?.$disconnect();if(started)await exec('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);await rm(root,{recursive:true,force:true});
}
