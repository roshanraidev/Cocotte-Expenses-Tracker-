// Disposable database/browser only. Never reads the real DATABASE_URL or accesses Zonal.
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
import {saveWeeklyForecast,saveActualSales} from '../src/lib/sales-service';
import {financialWeek} from '../src/lib/financial-data';
import {dashboardWeek} from '../src/lib/zonal/weekly-sales-data';
import {previewImport,resolveImport} from '../src/lib/zonal/service';
import {dateValue,weekDays} from '../src/lib/dates';
const exec=promisify(execFile),root=await mkdtemp(join(tmpdir(),'cocotte-weekly-sales-')),cluster=join(root,'postgres');
await exec('initdb',['-D',cluster,'-A','trust','-U','sales_test','--no-locale']);
await exec('pg_ctl',['-D',cluster,'-l',join(root,'postgres.log'),'-o',`-p 51946 -h 127.0.0.1 -k ${root}`,'-w','start']);
const url='postgresql://sales_test@127.0.0.1:51946/postgres';
if(url===process.env.DATABASE_URL)throw new Error('Disposable database required.');
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:3})}),pool=new Pool({connectionString:url});
const actor={id:'admin',restaurantId:'restaurant',role:'SUPER_USER' as const},monday='2026-10-26',today='2026-11-06',branch='003 – Parsons Green',password=randomBytes(24).toString('base64url');
let app:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,poolClosed=false;
function report(date:string,multiplier:number){
 return {branch,date,currency:'GBP',gross:(120*multiplier).toFixed(2),discount:multiplier===1?'5.00':'0.00',vat:(20*multiplier).toFixed(2),net:(100*multiplier).toFixed(2),food:(70*multiplier).toFixed(2),drink:(20*multiplier).toFixed(2),specials:(10*multiplier).toFixed(2),covers:String(10*multiplier),transactions:multiplier===1?'15':'25'};
}
try{
 for(const migration of (await readdir('prisma/migrations')).sort())if(migration!=='migration_lock.toml')await pool.query(await readFile('prisma/migrations/'+migration+'/migration.sql','utf8'));
 await pool.end();poolClosed=true;
 await prisma.restaurant.create({data:{id:actor.restaurantId,name:'SYNTHETIC WEEKLY SALES TEST',settings:{create:{}}}});
 await prisma.user.create({data:{...actor,name:'Test Super User',email:'sales-overview@example.test',passwordHash:await hashPassword(password)}});
 await prisma.zonalConnection.create({data:{restaurantId:actor.restaurantId,branch}});
 await saveWeeklyForecast(prisma,actor,{weekStart:monday,version:0,amounts:Array(7).fill(10000n),reason:'Synthetic original plan'});
 await saveWeeklyForecast(prisma,actor,{weekStart:monday,version:1,amounts:Array(7).fill(12000n),reason:'Synthetic revised plan'});
 const first=await previewImport(prisma,actor,report(monday,1));
 await resolveImport(prisma,actor,first,false,false,'Explicit synthetic historic approval');
 const second=await previewImport(prisma,actor,report('2026-10-27',2));
 await resolveImport(prisma,actor,second,false,false,'Explicit synthetic historic approval');
 const unchanged=await previewImport(prisma,actor,report(monday,1));
 assert(unchanged);await resolveImport(prisma,actor,first,false,false,'Repeated approval');
 await previewImport(prisma,actor,report('2026-10-28',999));
 assert.equal(await prisma.dailySales.count(),2);
 const approved=await prisma.zonalImport.findUniqueOrThrow({where:{id:first}});
 await prisma.zonalImport.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,date:approved.date,branch,source:'ZONAL_BROWSER',status:'APPROVED',completedAt:new Date(),salesVersion:approved.salesVersion,payload:approved.payload as object,fingerprint:approved.fingerprint}});
 await prisma.dailySales.create({data:{restaurantId:actor.restaurantId,date:dateValue('2026-10-19'),amountPence:999900n}});
 const canonical=await prisma.dailySales.findMany({orderBy:{date:'asc'}});
 const forecastBefore=await prisma.forecastDay.findMany({orderBy:{date:'asc'}});
 const before=await financialWeek(actor.restaurantId,monday,today,prisma);
 const snapshot=await dashboardWeek(prisma,actor.restaurantId,monday,today);
 assert.deepEqual(snapshot.financial.finance,before.finance);
 assert.equal(snapshot.overview.actualNet,30000n);assert.equal(snapshot.overview.food,21000n);assert.equal(snapshot.overview.drink,6000n);assert.equal(snapshot.overview.specials,3000n);
 assert.equal(snapshot.overview.gross,36000n);assert.equal(snapshot.overview.discount,500n);assert.equal(snapshot.overview.vat,6000n);
 assert.equal(snapshot.overview.covers,30n);assert.equal(snapshot.overview.transactions,40n);assert.equal(snapshot.overview.averageNetPerCover,1000n);
 assert.equal(snapshot.overview.variance,10000n);assert.equal(snapshot.overview.varianceBps,5000n);assert.equal(snapshot.overview.projectedPence,90000n);
 assert.equal(snapshot.financial.sales!.actualPence,snapshot.overview.actualNet);
 console.log('PASS isolated PostgreSQL: approved reports, repeated approvals/import rows, preview exclusion, all sales metrics, selected-week scope and purchasing snapshot agreement.');

 app=spawn('node',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3181'],{env:{...process.env,DATABASE_URL:url,DATABASE_POOL_SIZE:'3',PLAYWRIGHT_BROWSERS_PATH:join(root,'no-browser')},stdio:'ignore'});
 const base='http://localhost:3181';
 for(let n=0;n<100;n++){try{if((await fetch(base+'/login')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];
 page.on('pageerror',()=>errors.push('Browser runtime error'));
 await page.goto(base+'/login');await page.getByLabel('Email address').fill('sales-overview@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in to your kitchen'}).click();await expect(page).toHaveURL(/dashboard/);
 await page.goto(base+'/dashboard?week='+monday);
 const overview=page.locator('[data-weekly-sales-overview]');
 await expect(overview.getByRole('heading',{name:'Weekly Sales Overview',exact:true})).toBeVisible();
 await expect(overview.locator('[data-sales-kpi="net"]')).toHaveText('£300.00');
 await expect(overview.locator('[data-sales-kpi="food"]')).toHaveText('£210.00');
 await expect(overview.locator('[data-sales-kpi="drink"]')).toHaveText('£60.00');
 await expect(overview.locator('[data-sales-kpi="specials"]')).toHaveText('£30.00');
 await expect(overview).toContainText('2/7 days recorded');await expect(overview).toContainText('50.00%');await expect(overview).toContainText('£900.00');
 await expect(page.getByRole('heading',{name:'WEEKLY AVAILABLE TO SPEND',exact:true})).toBeVisible();
 await expect(overview.getByText('No matching approved import',{exact:false})).toHaveCount(0);
 await expect(overview.locator('svg.recharts-surface')).toHaveCount(2);
 await overview.screenshot({path:'/tmp/cocotte-weekly-sales-overview-test.png'});
 await overview.getByText('Daily sales breakdown · seven business dates',{exact:true}).click();
 const row=overview.getByRole('row').filter({has:page.getByRole('link',{name:monday,exact:true})});
 await expect(row).toContainText('£100.00');await expect(row).toContainText('£70.00');await expect(row).toContainText('£10.00');
 await page.goto(base+'/sales?date='+monday);
 await expect(page.locator('table').getByRole('row').filter({has:page.locator('[data-sales-source="Zonal"]')})).toHaveCount(2);
 await page.goto(base+'/reports?week='+monday+'&tab=sales');await expect(page.getByText('£300.00',{exact:false}).first()).toBeVisible();
 await page.goto(base+'/dashboard?week=2026-10-19');
 await expect(page.locator('[data-sales-kpi="net"]')).toHaveText('£9,999.00');
 await expect(page.locator('[data-sales-kpi="food"]')).toHaveText('Not available');
 await page.goto(base+'/dashboard?week='+monday);
 for(const width of [390,320]){
  await page.setViewportSize({width,height:1000});
  try{await expect.poll(async()=>await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),{timeout:3000}).toBe(true);}
  catch(error){console.log('Synthetic mobile overflow',await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,css:e.getAttribute('class'),right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.right>innerWidth+1&&e.width>0).slice(0,15)})));await page.screenshot({path:'/tmp/cocotte-sales-mobile-overflow.png',fullPage:true});throw error;}
  await expect(page.locator('[data-sales-kpi="net"]')).toBeVisible();
 }
 assert.deepEqual(await prisma.dailySales.findMany({orderBy:{date:'asc'}}),canonical);
 assert.deepEqual(await prisma.forecastDay.findMany({orderBy:{date:'asc'}}),forecastBefore);
 assert.deepEqual((await financialWeek(actor.restaurantId,monday,today,prisma)).finance,before.finance);
 await saveActualSales(prisma,actor,{date:'2026-10-28',amount:5000n,version:0,reason:'Synthetic manual day with no Zonal breakdown'},today);
 await page.goto(base+'/dashboard?week='+monday);
 await expect(page.locator('[data-sales-kpi="net"]')).toHaveText('£350.00');
 await expect(page.locator('[data-sales-kpi="food"]')).toHaveText('Not available');
 await expect(page.getByText('Verified department coverage: 2/3 recorded days.',{exact:false})).toBeVisible();
 await saveActualSales(prisma,actor,{date:monday,amount:12500n,version:1,reason:'Synthetic manual correction invalidates old report'},today);
 const changed=await dashboardWeek(prisma,actor.restaurantId,monday,today);
 assert.equal(changed.overview.actualNet,37500n);assert.equal(changed.overview.detailedDays,1);
 assert.equal(changed.overview.food,null);assert.equal(changed.overview.sources.has(monday),false);
 for(const date of weekDays(monday).slice(3))await saveActualSales(prisma,actor,{date,amount:10000n,version:0,reason:'Synthetic completed week'},today);
 await page.goto(base+'/dashboard?week='+monday);
 await expect(page.locator('[data-weekly-sales-overview]')).toContainText('Complete week · 7/7 days recorded');
 await expect(page.locator('[data-sales-kpi="food"]')).toHaveText('Not available');
 const final=await dashboardWeek(prisma,actor.restaurantId,monday,today);
 assert.equal(final.overview.actualNet,final.financial.sales!.actualPence);
 assert.deepEqual(final.financial.finance,(await financialWeek(actor.restaurantId,monday,today,prisma)).finance);
 assert.deepEqual(await prisma.forecastDay.findMany({orderBy:{date:'asc'}}),forecastBefore);
 const anonymous=await browser.newPage();await anonymous.goto(base+'/dashboard');await expect(anonymous).toHaveURL(/login/);await anonymous.close();
 assert.deepEqual(errors,[]);
 console.log('PASS browser: sales KPI/cards, charts and seven-date breakdown, Daily Sales/Reports agreement, selected week, manual/stale details unavailable, complete/partial states, 320/390px, purchasing hero preserved and forecasts unchanged. Synthetic data only.');
 console.log('Synthetic screenshot: /tmp/cocotte-weekly-sales-overview-test.png');
}finally{
 await browser?.close();app?.kill('SIGTERM');if(!poolClosed)await pool.end();await prisma.$disconnect();
 await exec('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);await rm(root,{recursive:true,force:true});
}
