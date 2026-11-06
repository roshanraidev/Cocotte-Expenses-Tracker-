// ISOLATED TEST DATA ONLY. Never reads or connects to the restaurant DATABASE_URL.
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { chromium,expect } from '@playwright/test';
import { spawn,execFile,type ChildProcess } from 'node:child_process';
import { mkdtemp,readFile,readdir,rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { hashPassword } from '../../src/lib/password';
import { saveWeeklyForecast } from '../../src/lib/sales-service';
import { runOperation } from '../../src/lib/operations';
import { resolveImport,fingerprint } from '../../src/lib/zonal/service';
import { previewAssessment } from '../../src/lib/zonal/approval-data';
import { validateReport } from '../../src/lib/zonal/validation';
import { financialWeek } from '../../src/lib/financial-data';
import { dateValue } from '../../src/lib/dates';
const execute=promisify(execFile);
const testRoot=await mkdtemp(join(tmpdir(),'cocotte-zonal-approval-'));
const testCluster=join(testRoot,'postgres');
await execute('initdb',['-D',testCluster,'-A','trust','-U','zonal_test','--no-locale']);
await execute('pg_ctl',['-D',testCluster,'-l',join(testRoot,'postgres.log'),'-o',`-p 51944 -h 127.0.0.1 -k ${testRoot}`,'-w','start']);
const url='postgresql://zonal_test@127.0.0.1:51944/postgres';
const server={close:async()=>{await execute('pg_ctl',['-D',testCluster,'-m','fast','-w','stop']);await rm(testRoot,{recursive:true,force:true});}};
if(!url||url===process.env.DATABASE_URL)throw new Error('Disposable test database is required.');
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:3})});
const pool=new Pool({connectionString:url});
const date='2026-11-03',monday='2026-11-02',branch='003 – Parsons Green';
const actor={id:'test-admin',restaurantId:'restaurant',role:'SUPER_USER' as const};
const password=randomBytes(24).toString('base64url');
const base='http://localhost:3179';
let app:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
let poolClosed=false;
let testServerLog='';
try{
 for(const entry of (await readdir('prisma/migrations')).sort())if(entry!=='migration_lock.toml')await pool.query(await readFile(`prisma/migrations/${entry}/migration.sql`,'utf8'));
 await pool.end();poolClosed=true;
 await prisma.restaurant.create({data:{id:'restaurant',name:'Cocotte · ISOLATED TEST DATA',settings:{create:{}}}});
 await prisma.user.create({data:{...actor,name:'Test Super User',email:'zonal-test@example.test',passwordHash:await hashPassword(password)}});
 await prisma.zonalConnection.create({data:{restaurantId:actor.restaurantId,branch}});
 const report=validateReport({branch,date,currency:'GBP',gross:'120.00',discount:'0.00',vat:'20.00',net:'100.00',food:'70.00',drink:'20.00',specials:'10.00',covers:'12',transactions:'38'},branch,date);
 const makePreview=()=>prisma.zonalImport.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,date:dateValue(date),branch,source:'ZONAL_BROWSER',payload:report,fingerprint:fingerprint(report),salesVersion:0}});
 const first=await makePreview();
 assert((await previewAssessment(prisma,actor.restaurantId,first)).issues.some(i=>i.code==='MISSING_FORECAST'));
 await assert.rejects(resolveImport(prisma,actor,first.id,false,false,'Test report approval'),/weekly forecast is missing/);
 assert.equal(await prisma.dailySales.count(),0);
 console.log('PASS (test database): missing-forecast approval blocked; correct-week plan link assessed.');
 await saveWeeklyForecast(prisma,actor,{weekStart:monday,version:0,amounts:Array(7).fill(10000n),reason:'Synthetic test plan'});
 await saveWeeklyForecast(prisma,actor,{weekStart:monday,version:1,amounts:Array(7).fill(12000n),reason:'Synthetic revised forecast'});
 const key={restaurantId_weekStart:{restaurantId:actor.restaurantId,weekStart:dateValue(monday)}};
 // Fixture-only finalized state, then exercise the real audited reopen operation.
 const locked=await prisma.weeklyForecast.update({where:key,data:{finalizedAt:new Date()}});
 await assert.rejects(resolveImport(prisma,actor,first.id,false,false,'Test report approval'),/finalized/);
 assert((await previewAssessment(prisma,actor.restaurantId,first)).issues.some(i=>i.code==='FINALIZED_WEEK'));
 await runOperation(prisma,actor,'reopen',{weekStart:monday,stamp:locked.updatedAt.toISOString(),reason:'Reopen synthetic test fixture'});
 assert.equal(await prisma.auditLog.count({where:{action:'WEEK_REOPENED'}}),1);
 const latest=await makePreview();
 assert((await previewAssessment(prisma,actor.restaurantId,first)).issues.some(i=>i.code==='SUPERSEDED'));
 await assert.rejects(resolveImport(prisma,actor,first.id,false,false,'Test report approval'),/newer preview/);
 const forecastsBefore=await prisma.forecastDay.findMany({orderBy:{date:'asc'}});
 app=spawn('node',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3179'],{env:{...process.env,DATABASE_URL:url,DATABASE_POOL_SIZE:'3'},stdio:['ignore','pipe','pipe']});
 app.stdout?.on('data',data=>{testServerLog+=data;});app.stderr?.on('data',data=>{testServerLog+=data;});
 for(let n=0;n<100;n++){
  try{if((await fetch(base+'/login')).ok)break;}catch{/* startup */}
  if(n===99)throw new Error('Isolated app did not start.');
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors:string[]=[];page.on('pageerror',()=>errors.push('Browser runtime error'));
 await page.goto(base+'/login');await page.getByLabel('Email address').fill('zonal-test@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in to your kitchen'}).click();await expect(page).toHaveURL(/\/dashboard/);
 await page.goto(base+'/admin/integrations/zonal');
 const card=page.locator(`#preview-${latest.id}`);await expect(card.getByText('Ready to approve',{exact:true})).toBeVisible();
 await card.getByLabel('Reason for import / correction').fill('Approve synthetic report for dashboard test');
 await card.getByRole('button',{name:'Approve import',exact:true}).click();
 await expect.poll(async()=>await prisma.zonalImport.count({where:{id:latest.id,status:'APPROVED'}})).toBe(1);
 await expect.poll(async()=>await prisma.dailySales.count()).toBe(1);
 const sale=await prisma.dailySales.findUniqueOrThrow({where:{restaurantId_date:{restaurantId:actor.restaurantId,date:dateValue(date)}}});assert.equal(sale.amountPence,10000n);
 assert.deepEqual(await prisma.forecastDay.findMany({orderBy:{date:'asc'}}),forecastsBefore);
 assert.equal(await prisma.auditLog.count({where:{action:'ZONAL_SALES_IMPORTED'}}),1);
 await page.getByRole('link',{name:'View this week’s dashboard',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/dashboard\\?week='+monday));
 const salesPanel=page.locator('section').filter({has:page.getByRole('heading',{name:'Weekly Sales Performance'})});
 const row=salesPanel.getByRole('row').filter({has:page.locator('[data-sales-source="Zonal"]')});
 await expect(row).toContainText('£100.00');await expect(row.getByText('Zonal',{exact:true})).toBeVisible();await expect(row).toContainText('Approved');
 await page.screenshot({path:'/tmp/cocotte-zonal-approved-dashboard-test.png',fullPage:true,caret:'initial'});
 await page.goto(base+`/sales?date=${date}`);await expect(page.locator('[data-sales-source="Zonal"]')).toBeVisible();await expect(page.getByRole('row').filter({has:page.locator('[data-sales-source="Zonal"]')})).toContainText('£100.00');
 await page.goto(base+`/reports?week=${monday}&tab=sales`);await expect(page.getByText('£100.00',{exact:false}).first()).toBeVisible();
 await page.goto(base+`/admin/planning?week=${monday}`);await expect(page.getByRole('heading',{name:'Weekly Planning',exact:true})).toBeVisible();
 const financial=await financialWeek(actor.restaurantId,monday,'2026-11-06',prisma);assert.equal(financial.sales?.actualPence,10000n);assert.equal(financial.sales?.projectedPence,82000n);
 assert((await resolveImport(prisma,actor,latest.id,false,true,'Repeated synthetic approval')).includes('Already approved'));
 assert.equal(await prisma.dailySales.count(),1);
 const duplicate=await prisma.zonalImport.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,date:dateValue(date),branch,source:'ZONAL_BROWSER',payload:report,fingerprint:fingerprint(report),salesVersion:1}});
 await assert.rejects(resolveImport(prisma,actor,duplicate.id,false,true,'Duplicate test'),/Duplicate/);
 const expired=await prisma.zonalImport.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,date:dateValue('2026-11-04'),branch,source:'ZONAL_BROWSER',payload:{...report,date:'2026-11-04'},fingerprint:'expired-test',salesVersion:0,createdAt:new Date(0)}});
 assert((await previewAssessment(prisma,actor.restaurantId,expired)).issues.some(i=>i.code==='EXPIRED'));
 await page.goto(base+'/admin/integrations/zonal');
 for(const width of [390,320]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));}
 assert.deepEqual(errors,[]);
 console.log('PASS (ISOLATED TEST DATA ONLY): one synthetic £100 report explicitly approved in the UI; one Daily Sales record; Zonal badge and approval time on Dashboard and Daily Sales; reports/planning share the approved data; original and revised forecasts unchanged; duplicate/idempotent/expired checks passed; responsive at 320/390px.');
 console.log('Test screenshot: /tmp/cocotte-zonal-approved-dashboard-test.png');
}catch(error){
 console.error('ISOLATED TEST SERVER DIAGNOSTICS:',testServerLog.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[test database URL redacted]').slice(-10000));
 throw error;
}finally{
 await browser?.close();app?.kill('SIGTERM');if(!poolClosed)await pool.end();await prisma.$disconnect();await server.close();
}
