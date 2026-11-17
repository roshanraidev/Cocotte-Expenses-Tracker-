// Real PostgreSQL queue/transaction tests with a test-only report provider. No live restaurant writes.
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {Pool} from 'pg';
import {execFile,spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {encryptCredentials} from '../src/lib/zonal/crypto';
import {enqueueSalesJob,claimSalesJob,jobReview,requestBulkApproval,controlSalesJob,salesJobStatus} from '../src/lib/sales-history/jobs';
import {workSalesJob,type SalesJobDependencies} from '../src/lib/sales-history/job-worker';
import {validateReport} from '../src/lib/zonal/validation';
import {fingerprint} from '../src/lib/zonal/service';
import {addDays,dateValue,londonToday} from '../src/lib/dates';
import {historicalDays} from '../src/lib/sales-history/data';
const exec=promisify(execFile),root=await mkdtemp(join(tmpdir(),'cocotte-jobs-')),cluster=join(root,'postgres'),url='postgresql://jobs_test@127.0.0.1:51953/postgres';
assert.notEqual(url,process.env.DATABASE_URL);process.env.ZONAL_CREDENTIALS_KEY=randomBytes(32).toString('base64');
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:6})}),pool=new Pool({connectionString:url});let started=false,poolClosed=false;
const actor={id:'admin',restaurantId:'restaurant',role:'SUPER_USER' as const};
const raw=(date:string)=>({branch:'003 – Parsons Green' as const,date,currency:'GBP' as const,gross:'120.00',discount:'0.00',vat:'20.00',net:'100.00',food:'70.00',drink:'20.00',specials:'10.00',covers:'5',transactions:'10'});
const deps:SalesJobDependencies={latest:async()=>({code:'REPORT_EXTRACTED',loginVerified:true,report:raw('2026-11-12')}),batch:async(_r,_c,dates,onDay)=>{for(const date of dates)await onDay(date,{code:'REPORT_EXTRACTED',loginVerified:true,report:raw(date)});return {code:'AUTHENTICATED',loginVerified:true};}};
async function ready(){await prisma.zonalSalesWorker.upsert({where:{id:'test'},create:{id:'test'},update:{heartbeatAt:new Date()}});await prisma.zonalConnection.updateMany({data:{lastAttemptAt:new Date(0)}});await prisma.zonalSalesJob.updateMany({where:{status:'QUEUED'},data:{leaseUntil:null}});}
async function tick(){await ready();const c=await claimSalesJob(prisma);if(c)await workSalesJob(prisma,c,deps);return c;}
async function child(crash=false){await ready();return new Promise<number|null>((resolve,reject)=>{const p=spawn(process.execPath,['--conditions=react-server','--import','tsx','scripts/sales-jobs-fixture-worker.ts'],{env:{...process.env,DATABASE_URL:url,FIXTURE_CRASH:crash?'yes':'no',FIXTURE_FAIL:'yes'},stdio:'ignore'});p.on('error',reject);p.on('exit',resolve);});}
try{
 await exec('initdb',['-D',cluster,'-A','trust','-U','jobs_test','--no-locale']);await exec('pg_ctl',['-D',cluster,'-l',join(root,'postgres.log'),'-o',`-p 51953 -h 127.0.0.1 -k ${root}`,'-w','start']);started=true;
 for(const dir of (await readdir('prisma/migrations')).sort())if(dir!=='migration_lock.toml')await pool.query(await readFile('prisma/migrations/'+dir+'/migration.sql','utf8'));
 await pool.end();poolClosed=true;
 await prisma.restaurant.create({data:{id:'restaurant',name:'Queue Test',settings:{create:{}}}});await prisma.user.create({data:{id:'admin',restaurantId:'restaurant',name:'Test Admin',email:'admin@jobs.test',passwordHash:'test-only-unused',role:'SUPER_USER'}});
 await prisma.zonalConnection.create({data:{restaurantId:'restaurant',branch:'003 – Parsons Green',encryptedCredentials:encryptCredentials('restaurant',{username:'fixture',password:'fixture-only'})}});
 await prisma.auditLog.create({data:{restaurantId:'restaurant',actorId:'admin',action:'ZONAL_SALES_HISTORY_DISCOVERED',entity:'Restaurant',entityId:'restaurant',after:{offeredFirst:'2026-11-01',offeredLast:'2026-11-12',verifiedDates:['2026-11-01','2026-11-12'],branch:'003 – Parsons Green'}}});
 for(const monday of ['2026-11-02','2026-11-09'])await prisma.weeklyForecast.create({data:{restaurantId:'restaurant',weekStart:dateValue(monday),targetBps:2400,warningBps:2200,finalizedAt:monday==='2026-11-09'?new Date():null,days:{create:Array.from({length:7},(_,i)=>({date:dateValue(addDays(monday,i)),originalForecastPence:15000n,forecastPence:15000n}))}}});
 const unchanged=validateReport(raw('2026-11-02'),'003 – Parsons Green','2026-11-02');
 await prisma.dailySales.createMany({data:[{restaurantId:'restaurant',date:dateValue('2026-11-02'),amountPence:10000n},{restaurantId:'restaurant',date:dateValue('2026-11-05'),amountPence:99999n}]});
 await prisma.zonalImport.create({data:{restaurantId:'restaurant',actorId:'admin',date:dateValue('2026-11-02'),branch:unchanged.branch,source:'ZONAL_BROWSER',status:'APPROVED',payload:unchanged,fingerprint:fingerprint(unchanged),salesVersion:0,completedAt:new Date()}});
 await assert.rejects(enqueueSalesJob(prisma,actor,'HISTORY'),/offline/);await ready();
 const [id,same]=await Promise.all([enqueueSalesJob(prisma,actor,'HISTORY'),enqueueSalesJob(prisma,actor,'HISTORY')]);assert.equal(id,same);assert.equal(await prisma.zonalSalesJob.count(),1);
 // The two kinds queue independently, while browser work remains serialized.
 const historyClaim=await claimSalesJob(prisma);assert.equal(historyClaim?.id,id);
 const independentDaily=await enqueueSalesJob(prisma,actor,'DAILY');assert.notEqual(independentDaily,id);assert.equal(await enqueueSalesJob(prisma,actor,'DAILY'),independentDaily);assert.equal(await claimSalesJob(prisma),null);
 await prisma.zonalSalesJob.update({where:{id},data:{status:'QUEUED',leaseToken:null,leaseUntil:null}});
 const priority=await claimSalesJob(prisma);assert.equal(priority?.id,independentDaily);await prisma.zonalSalesJob.update({where:{id:independentDaily},data:{status:'COMPLETE',leaseToken:null,leaseUntil:null}});
 assert.equal(await child(),0); // latest-date probe persisted separately from the web request
 assert.equal(await child(true),75); // terminate after two per-date checkpoints, without cleanup
 assert.equal((await prisma.zonalSalesJob.findUniqueOrThrow({where:{id}})).status,'RUNNING');
 assert.equal(await prisma.zonalSalesJobDay.count({where:{jobId:id,status:{in:['STAGED','SKIPPED']}}}),2);
 assert.equal(await prisma.dailySales.count(),2); // fetching never changes official sales
 await prisma.zonalSalesJob.update({where:{id},data:{leaseUntil:new Date(0)}});await prisma.zonalSyncBatch.updateMany({data:{heartbeatAt:new Date(0)}});
 const claims=await Promise.all([claimSalesJob(prisma),claimSalesJob(prisma)]);assert.equal(claims.filter(Boolean).length,1);
 await ready();await workSalesJob(prisma,claims.find(Boolean)!,{...deps,batch:async(r,c,dates,onDay)=>{for(const date of dates)await onDay(date,date==='2026-11-04'?{code:'REPORT_INVALID',loginVerified:true}:{code:'REPORT_EXTRACTED',loginVerified:true,report:raw(date)});return {code:'AUTHENTICATED',loginVerified:true};}});
 for(let i=0;i<5&&(await prisma.zonalSalesJob.findUniqueOrThrow({where:{id}})).status!=='REVIEW';i++)await tick();
 const status=(await salesJobStatus(prisma,actor)).jobs.find(j=>j.id===id)!;assert.equal(status.processed,Math.round((+dateValue(addDays(londonToday(),-1)) - +dateValue('2026-11-01'))/86400000)+1);assert.equal(status.remaining,0);assert.equal(status.failed,1);assert.equal(status.skipped,1);assert.equal(await prisma.dailySales.count(),2);
 // Durable staging remains reviewable after the ordinary 30-minute preview window.
 await prisma.zonalImport.updateMany({where:{status:'PREVIEW'},data:{createdAt:new Date(Date.now()-2*86400000)}});
 let review=await jobReview(prisma,actor,id);assert.equal(review.clean.length,4);assert.equal(review.total,'40000');assert(review.exceptions.some(e=>e.reason.includes('forecast')));assert(review.exceptions.some(e=>e.reason.includes('finalized')));assert(review.exceptions.some(e=>e.reason.includes('Replacement')||e.reason.includes('replacement')));
 await assert.rejects(jobReview(prisma,{...actor,restaurantId:'foreign'},id),/not found/);
 await assert.rejects(requestBulkApproval(prisma,actor,id,'wrong','Historical source verification'),/Review changed/);
 const approvals=await Promise.allSettled([requestBulkApproval(prisma,actor,id,review.digest,'Bulk historical verification'),requestBulkApproval(prisma,actor,id,review.digest,'Bulk historical verification')]);assert.equal(approvals.filter(r=>r.status==='fulfilled').length,1);assert.equal(await prisma.dailySales.count(),2);
 await tick();assert.equal(await prisma.dailySales.count(),6);assert.equal((await prisma.dailySales.findUniqueOrThrow({where:{restaurantId_date:{restaurantId:'restaurant',date:dateValue('2026-11-05')}}})).amountPence,99999n);
 assert.equal(await prisma.zonalSalesJobDay.count({where:{jobId:id,status:'APPROVED'}}),4);assert.equal(await prisma.auditLog.count({where:{action:'ZONAL_SALES_IMPORTED'}}),4);
 assert.equal((await historicalDays(prisma,'restaurant','2026-11-01','2026-11-12')).length,6);
 await ready();await controlSalesJob(prisma,actor,id,'retry');for(let i=0;i<10&&(await prisma.zonalSalesJob.findUniqueOrThrow({where:{id}})).status!=='REVIEW';i++)await tick();review=await jobReview(prisma,actor,id);assert.equal(review.clean.length,1);await requestBulkApproval(prisma,actor,id,review.digest,'Retry validated date');await tick();assert.equal(await prisma.dailySales.count(),7);
 // Incremental daily work rechecks only the seven-date correction window, not all history.
 await ready();const daily=await enqueueSalesJob(prisma,actor,'DAILY');const dailyDays=await prisma.zonalSalesJobDay.findMany({where:{jobId:daily},orderBy:{date:'asc'}});assert.equal(dailyDays.length,Math.round((+dateValue(addDays(londonToday(),-1)) - +dateValue('2026-11-06'))/86400000)+1);assert.equal(dailyDays[0].date.toISOString().slice(0,10),'2026-11-06');
 await controlSalesJob(prisma,actor,daily,'pause');assert.equal(await claimSalesJob(prisma),null);await ready();await controlSalesJob(prisma,actor,daily,'resume');await tick();await tick();await tick();assert.equal(await prisma.dailySales.count(),7);
 const dReview=await jobReview(prisma,actor,daily);assert(dReview.exceptions.length>0);assert.equal(dReview.clean.length,0);
 const counts=await prisma.dailySales.groupBy({by:['restaurantId','date'],_count:{_all:true}});assert(counts.every(r=>r._count._all===1));assert.equal(await prisma.purchaseInvoice.count(),0);
 console.log('PASS durable PostgreSQL jobs: one-click queue, concurrent claims, killed child/restart/resume, per-day checkpoints, failed-date retry, paused job, durable staged approval, bulk totals, permission/restaurant isolation, missing forecasts, finalized weeks, manual correction exception, unchanged skip, 7-day incremental window, canonical chart visibility, audit and no duplicate sales. Isolated fixtures only.');
}finally{if(!poolClosed)await pool.end();await prisma.$disconnect();if(started)await exec('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);await rm(root,{recursive:true,force:true});}
