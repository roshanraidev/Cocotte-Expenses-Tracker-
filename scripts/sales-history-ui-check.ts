// Disposable database and browser checks. Never connects to configured restaurant data.
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {Pool} from 'pg';
import {chromium,expect} from '@playwright/test';
import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {hashPassword} from '../src/lib/password';
import {historicalDays} from '../src/lib/sales-history/data';
import {historicalAnalytics} from '../src/lib/sales-history/analytics';
import {encryptCredentials} from '../src/lib/zonal/crypto';
import {claimSalesJob} from '../src/lib/sales-history/jobs';
import {workSalesJob,type SalesJobDependencies} from '../src/lib/sales-history/job-worker';
import {dateValue,addDays} from '../src/lib/dates';
import {validateReport} from '../src/lib/zonal/validation';
import {fingerprint} from '../src/lib/zonal/service';
const exec=promisify(execFile),root=await mkdtemp(join(tmpdir(),'cocotte-history-')),cluster=join(root,'postgres'),url='postgresql://history_test@127.0.0.1:51952/postgres',base='http://localhost:3189';
assert.notEqual(url,process.env.DATABASE_URL);
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:4})}),pool=new Pool({connectionString:url});
process.env.ZONAL_CREDENTIALS_KEY=randomBytes(32).toString('base64');
let workerHeartbeat:ReturnType<typeof setInterval>|undefined;
const password=randomBytes(24).toString('base64url');let started=false,poolClosed=false,app:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,log='';
try{
 await exec('initdb',['-D',cluster,'-A','trust','-U','history_test','--no-locale']);await exec('pg_ctl',['-D',cluster,'-l',join(root,'postgres.log'),'-o',`-p 51952 -h 127.0.0.1 -k ${root}`,'-w','start']);started=true;
 for(const dir of (await readdir('prisma/migrations')).sort())if(dir!=='migration_lock.toml')await pool.query(await readFile('prisma/migrations/'+dir+'/migration.sql','utf8'));
 await pool.end();poolClosed=true;
 for(const restaurantId of ['restaurant'])await prisma.restaurant.create({data:{id:restaurantId,name:restaurantId,settings:{create:{}}}});
 await prisma.user.create({data:{id:'owner',restaurantId:'restaurant',name:'History Test',email:'history@test.local',passwordHash:await hashPassword(password),role:'SUPER_USER'}});
 const report=validateReport({branch:'003 – Parsons Green',date:'2026-11-10',currency:'GBP',gross:'120.00',discount:'0.00',vat:'20.00',net:'100.00',food:'70.00',drink:'20.00',specials:'10.00',covers:'5',transactions:'10'},'003 – Parsons Green','2026-11-10');
 await prisma.dailySales.createMany({data:[{restaurantId:'restaurant',date:new Date('2025-11-10'),amountPence:8000n},{restaurantId:'restaurant',date:new Date('2026-11-10'),amountPence:10000n}]});
 await prisma.zonalImport.create({data:{restaurantId:'restaurant',actorId:'owner',date:new Date('2026-11-10'),branch:report.branch,source:'ZONAL_BROWSER',status:'APPROVED',payload:report,fingerprint:fingerprint(report),salesVersion:0,completedAt:new Date()}});
 await prisma.zonalImport.create({data:{restaurantId:'restaurant',actorId:'owner',date:new Date('2026-11-11'),branch:report.branch,source:'ZONAL_BROWSER',payload:{...report,date:'2026-11-11',net:'99999999'},fingerprint:'preview',salesVersion:0}});
 const before=await prisma.dailySales.findMany({orderBy:{id:'asc'}});
 const days=await historicalDays(prisma,'restaurant','2025-01-01','2026-12-31');assert.equal(days.length,2);assert.equal(days[1].food,'7000');assert.equal(days[0].food,null);
 const result=historicalAnalytics(days,{mode:'compare',granularity:'monthly',metric:'net',from:'2025-01-01',to:'2026-12-31',yearA:2025,yearB:2026},'2026-11-12');assert.equal(result.growthBps,'2500');
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3189'],{env:{...process.env,DATABASE_URL:url,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});app.stdout?.on('data',d=>{log+=String(d);});app.stderr?.on('data',d=>{log+=String(d);});await expect.poll(async()=>{try{return(await fetch(base+'/login')).status;}catch{return 0;}},{timeout:30000}).toBe(200);
 browser=await chromium.launch({headless:true});const context=await browser.newContext(),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/login');await page.getByLabel('Email address').fill('history@test.local');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in to your kitchen'}).click();await expect(page).toHaveURL(base+'/dashboard');
 await expect(page.getByRole('heading',{name:'Sales Performance & Historical Trends'})).toBeVisible();await expect(page.locator('.sales-history-kpis')).toContainText('£180.00');
 // All three entry points stay separate. The selected historical week is explicit.
 for(const name of ['Sync Weekly Net Sales','Import All Historical Sales'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
 await page.goto(base+'/dashboard?week=2026-11-02');const weekly=page.getByRole('region',{name:'Weekly Net Sales',exact:true});await expect(weekly).toContainText('2026-11-02–2026-11-08');await weekly.getByRole('button',{name:'Sync Weekly Net Sales',exact:true}).click();await expect(weekly.getByRole('alert')).toContainText('Connect the verified Parsons Green branch first.');assert.equal(await prisma.zonalSyncBatch.count(),0);
 await page.goto(base+'/dashboard?week=2026-11-23');await expect(page.getByRole('button',{name:'Sync Weekly Net Sales',exact:true})).toBeDisabled();await page.goto(base+'/dashboard');await expect(page.locator('.sales-history-kpis')).toContainText('£180.00');

 const order=await page.evaluate(()=>['.allowance-hero','.dashboard-sales-sync','.weekly-sales-overview','.sales-intelligence'].map(s=>document.querySelector(s)?.getBoundingClientRect().top??null));assert(order[0]!==null&&order[1]!==null&&order[0]<order[1]);
 await page.getByLabel('Chart mode',{exact:true}).selectOption('compare');await expect(page.locator('.sales-history-kpis')).toContainText('25.00%');await expect(page.locator('.sales-history-kpis')).toContainText('£20.00');
 await page.getByRole('button',{name:'CSV export'}).click();
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(300);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.sales-intelligence').screenshot({path:`/tmp/cocotte-history-${width}.png`});}
 await page.getByLabel('Chart mode',{exact:true}).selectOption('trend');await page.getByLabel('Sales metric',{exact:true}).selectOption('food');await expect(page.locator('.sales-history-kpis')).toContainText('£70.00');await page.getByLabel('Time granularity',{exact:true}).selectOption('daily');await expect(page.locator('.sales-history-foot')).toContainText('1 of');
 await expect(page.getByText('Background worker offline.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Import All Historical Sales',exact:true})).toBeDisabled();await expect(page.getByRole('heading',{name:'Sales Performance & Historical Trends'})).toBeVisible();
 await page.getByLabel('Sales metric',{exact:true}).selectOption('net');await page.getByLabel('Time granularity',{exact:true}).selectOption('monthly');await expect(page.locator('.sales-history-kpis')).toContainText('£180.00');
 await prisma.dailySales.update({where:{restaurantId_date:{restaurantId:'restaurant',date:new Date('2026-11-10')}},data:{amountPence:11000n,version:{increment:1}}});
 await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.dispatchEvent(new Event('focus'));});await expect(page.locator('.sales-history-kpis')).toContainText('£190.00');
 const originalAfter=await prisma.dailySales.findMany({orderBy:{id:'asc'}});assert.equal(originalAfter.length,before.length);
 // Exercise the actual one-click UI and bulk confirmation, with a test-only source provider.
 await prisma.zonalConnection.create({data:{restaurantId:'restaurant',branch:'003 – Parsons Green',encryptedCredentials:encryptCredentials('restaurant',{username:'fixture',password:'test-only'})}});
 await prisma.auditLog.create({data:{restaurantId:'restaurant',actorId:'owner',action:'ZONAL_SALES_HISTORY_DISCOVERED',entity:'Restaurant',entityId:'restaurant',after:{offeredFirst:'2026-11-09',offeredLast:'2026-11-12',verifiedDates:['2026-11-09','2026-11-12'],branch:'003 – Parsons Green'}}});
 await prisma.weeklyForecast.create({data:{restaurantId:'restaurant',weekStart:dateValue('2026-11-09'),targetBps:2400,warningBps:2200,days:{create:Array.from({length:7},(_,i)=>({date:dateValue(addDays('2026-11-09',i)),originalForecastPence:15000n,forecastPence:15000n}))}}});
 const beat=()=>prisma.zonalSalesWorker.upsert({where:{id:'ui-test'},create:{id:'ui-test'},update:{heartbeatAt:new Date()}});await beat();workerHeartbeat=setInterval(()=>void beat(),5000);
 await expect(page.getByRole('button',{name:'Import All Historical Sales',exact:true})).toBeEnabled({timeout:12000});await page.getByRole('button',{name:'Import All Historical Sales',exact:true}).click();await expect(page.getByText('Historical import queued.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Import All Historical Sales',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Sync Zonal Sales',exact:true})).toHaveCount(0);assert.equal(await prisma.zonalSalesJob.count(),1);
 await page.close(); // No web request or browser is required while the worker continues.
 const testReport=(date:string)=>({branch:'003 – Parsons Green' as const,date,currency:'GBP' as const,gross:'120.00',discount:'0.00',vat:'20.00',net:'100.00',food:'70.00',drink:'20.00',specials:'10.00',covers:'5',transactions:'10'});
 const provider:SalesJobDependencies={latest:async()=>({code:'REPORT_EXTRACTED',loginVerified:true,report:testReport('2026-11-12')}),batch:async(_r,_c,dates,onDay)=>{for(const date of dates)await onDay(date,{code:'REPORT_EXTRACTED',loginVerified:true,report:testReport(date)});return {code:'AUTHENTICATED',loginVerified:true};}};
 async function tick(){await prisma.zonalConnection.updateMany({data:{lastAttemptAt:new Date(0)}});await prisma.zonalSalesJob.updateMany({where:{status:'QUEUED'},data:{leaseUntil:null}});const claim=await claimSalesJob(prisma);if(claim)await workSalesJob(prisma,claim,provider);}
 for(let i=0;i<8;i++)await tick();assert.equal(await prisma.dailySales.count(),2);
 const reviewPage=await context.newPage();reviewPage.on('pageerror',e=>errors.push(e.message));await reviewPage.goto(base+'/dashboard');await expect(reviewPage.getByRole('button',{name:'Sync Zonal Sales',exact:true})).toHaveCount(0);await reviewPage.getByText('Progress, review and recovery',{exact:true}).click();await expect(reviewPage.getByRole('button',{name:'Import All Historical Sales',exact:true})).toBeVisible();await reviewPage.getByRole('region',{name:'Historical Sales',exact:true}).getByRole('button',{name:'Review & bulk approve'}).click();await expect(reviewPage.getByRole('region',{name:'Historical bulk approval summary'})).toContainText('3 clean, non-conflicting dates');await reviewPage.getByLabel('Historical approval reason',{exact:false}).fill('Isolated browser bulk verification');await reviewPage.getByLabel('I approve only the eligible dates and total shown above.').check();await reviewPage.getByRole('button',{name:'Approve 3 eligible dates'}).click();await expect(reviewPage.getByText('Bulk approval queued for 3 dates.',{exact:false})).toBeVisible();await tick();await expect(reviewPage.locator('.sales-history-kpis')).toContainText('£490.00',{timeout:15000});assert.equal(await prisma.dailySales.count(),5);
 assert.equal((await prisma.dailySales.findUniqueOrThrow({where:{restaurantId_date:{restaurantId:'restaurant',date:dateValue('2026-11-10')}}})).amountPence,11000n);assert.equal(await prisma.purchaseInvoice.count(),0);assert.deepEqual(errors,[]);
 console.log('PASS isolated production browser: always-visible chart, 390/768/1440px, comparison/CSV, offline worker protection, one-click job queue, browser closed during work, automatic internal continuation, explicit 3-day bulk approval, manual correction preserved, automatic chart refresh to approved totals. No real restaurant mutations.');
}catch(error){console.error('Isolated history diagnostics:',log);throw error;}finally{clearInterval(workerHeartbeat);await browser?.close();if(app&&app.exitCode===null){const p=app;await new Promise<void>(resolve=>{p.once('exit',()=>resolve());p.kill('SIGTERM');setTimeout(resolve,5000);});}if(!poolClosed)await pool.end();await prisma.$disconnect();if(started)await exec('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);await rm(root,{recursive:true,force:true});}
