// Disposable PostgreSQL + synthetic invoices/stock/sales only.
// Never imports dotenv or connects to the real restaurant database or Zonal.
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
import {saveWeeklyForecast} from '../src/lib/sales-service';
import {financialWeek} from '../src/lib/financial-data';
import {createFoodCostPreview,approveFoodCost,cancelFoodCost,foodCostReview,sourceIssues,zonalFoodSales} from '../src/lib/food-cost/service';
import {foodCost,foodCostPayload} from '../src/lib/food-cost/calculation';
import {dateValue,weekDays} from '../src/lib/dates';
import {fingerprint} from '../src/lib/zonal/service';
const exec=promisify(execFile),root=await mkdtemp(join(tmpdir(),'cocotte-food-cost-')),cluster=join(root,'postgres');
await exec('initdb',['-D',cluster,'-A','trust','-U','food_test','--no-locale']);
await exec('pg_ctl',['-D',cluster,'-l',join(root,'postgres.log'),'-o',`-p 51945 -h 127.0.0.1 -k ${root}`,'-w','start']);
const url='postgresql://food_test@127.0.0.1:51945/postgres';
if(url===process.env.DATABASE_URL)throw new Error('Disposable database required.');
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:3})}),pool=new Pool({connectionString:url});
const actor={id:'admin',restaurantId:'restaurant',role:'SUPER_USER' as const},from='2026-10-26',to='2026-11-01',branch='003 – Parsons Green',password=randomBytes(24).toString('base64url');
let app:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,poolClosed=false;
try{
 for(const migration of (await readdir('prisma/migrations')).sort())if(migration!=='migration_lock.toml')await pool.query(await readFile('prisma/migrations/'+migration+'/migration.sql','utf8'));
 await pool.end();poolClosed=true;
 await prisma.restaurant.create({data:{id:actor.restaurantId,name:'ISOLATED FOOD COST TEST',settings:{create:{}}}});
 await prisma.user.create({data:{...actor,name:'Synthetic Super User',email:'food-cost@example.test',passwordHash:await hashPassword(password)}});
 await prisma.supplier.create({data:{id:'supplier',restaurantId:actor.restaurantId,name:'Synthetic mixed supplier',foodWorkspace:true}});
 await saveWeeklyForecast(prisma,actor,{weekStart:from,version:0,amounts:Array(7).fill(100000n),reason:'Synthetic plan'});
 for(const date of weekDays(from))await prisma.dailySales.create({data:{restaurantId:actor.restaurantId,date:dateValue(date),amountPence:100000n}});
 await prisma.zonalConnection.create({data:{restaurantId:actor.restaurantId,branch}});
 const purchase=await prisma.purchaseInvoice.create({data:{id:'purchase',restaurantId:actor.restaurantId,supplierId:'supplier',reference:'TEST-P',accountingDate:dateValue('2026-10-28'),amountPence:150000n,confirmedAt:new Date()}});
 const credit=await prisma.purchaseInvoice.create({data:{id:'credit',restaurantId:actor.restaurantId,supplierId:'supplier',reference:'TEST-C',accountingDate:dateValue('2026-10-28'),amountPence:-10000n,creditForId:purchase.id,confirmedAt:new Date()}});
 const before=await financialWeek(actor.restaurantId,from,'2026-11-06',prisma);
 const forecasts=await prisma.forecastDay.findMany({orderBy:{date:'asc'}});
 const financialRows=await prisma.dailySales.findMany({orderBy:{date:'asc'}});
 function form(opening='500'){
  const f=new FormData();
  for(const [key,value] of Object.entries({from,to,opening,closing:'400',transfersIn:'50',transfersOut:'20',foodSales:'5000',salesMode:'MANUAL',stockReference:'Dated synthetic food stocktake and transfer log',salesReference:'Synthetic food-only sales report',complete:'on',['food-'+purchase.id]:'1200',['food-'+credit.id]:'80'}))f.set(key,value);
  f.append('invoiceId',purchase.id);f.append('invoiceId',credit.id);return f;
 }
 const incomplete=form();incomplete.delete('opening');
 const missing=await createFoodCostPreview(prisma,actor,incomplete);
 assert.equal((await foodCostReview(prisma,actor,missing.previewId!))!.result.complete,false);
 await assert.rejects(approveFoodCost(prisma,actor,missing.previewId!,false,'Synthetic approval'),/Incomplete Data/);
 await cancelFoodCost(prisma,actor,missing.previewId!);
 const first=await createFoodCostPreview(prisma,actor,form());
 assert.equal(await prisma.foodCostPeriod.count(),0);
 const ready=await foodCostReview(prisma,actor,first.previewId!);
 assert.equal(ready!.result.bps,2500n);assert.equal(ready!.result.consumption,125000n);
 await approveFoodCost(prisma,actor,first.previewId!,false,'Approve synthetic completed stocktake');
 assert((await approveFoodCost(prisma,actor,first.previewId!,false,'Retry')).includes('Already approved'));
 assert.equal((await createFoodCostPreview(prisma,actor,form())).previewId,null);
 const reordered=form();reordered.delete('invoiceId');reordered.append('invoiceId',credit.id);reordered.append('invoiceId',purchase.id);
 assert.equal((await createFoodCostPreview(prisma,actor,reordered)).previewId,null);
 assert.equal(await prisma.foodCostPeriod.count(),1);
 const original=await prisma.foodCostPeriod.findFirstOrThrow();
 const correction=await createFoodCostPreview(prisma,actor,form('600'));
 await assert.rejects(approveFoodCost(prisma,actor,correction.previewId!,false,'Correction'),/Correction requires/);
 await assert.rejects(approveFoodCost(prisma,actor,correction.previewId!,true,''),/audit reason/);
 await Promise.all([approveFoodCost(prisma,actor,correction.previewId!,true,'Synthetic corrected opening'),approveFoodCost(prisma,actor,correction.previewId!,true,'Synthetic concurrent retry')]);
 assert.equal((await prisma.foodCostPeriod.findFirstOrThrow()).version,2);
 assert.equal((await prisma.foodCostPeriod.findFirstOrThrow()).id,original.id);
 assert.equal(await prisma.auditLog.count({where:{action:'FOOD_COST_CORRECTED'}}),1);
 await assert.rejects(prisma.foodCostPeriod.create({data:{restaurantId:actor.restaurantId,from:original.from,to:original.to,category:'FOOD',payload:original.payload as object,fingerprint:original.fingerprint,approvedById:actor.id}}),error=>(error as {code?:string}).code==='P2002');
 const stale=await createFoodCostPreview(prisma,actor,form('550')),fresh=await createFoodCostPreview(prisma,actor,form('650'));
 await approveFoodCost(prisma,actor,fresh.previewId!,true,'Synthetic correction');
 await assert.rejects(approveFoodCost(prisma,actor,stale.previewId!,true,'Stale attempt'),/changed after preview/);
 await assert.rejects(createFoodCostPreview(prisma,{...actor,role:'CHEF'},form()),/Super User/);
 await assert.rejects(approveFoodCost(prisma,{...actor,restaurantId:'foreign'},first.previewId!,true,'Foreign attempt'),/not found/);
 const duplicate=form();duplicate.append('invoiceId',purchase.id);
 await assert.rejects(createFoodCostPreview(prisma,actor,duplicate),/only once/);
 const excessive=form();excessive.set('food-'+purchase.id,'1500.01');
 await assert.rejects(createFoodCostPreview(prisma,actor,excessive),/cannot exceed/);
 const future=form();future.set('to','2099-01-01');
 await assert.rejects(createFoodCostPreview(prisma,actor,future),/completed/);
 const after=await financialWeek(actor.restaurantId,from,'2026-11-06',prisma);
 assert.deepEqual(after.finance,before.finance);
 assert.deepEqual(await prisma.forecastDay.findMany({orderBy:{date:'asc'}}),forecasts);
 assert.deepEqual(await prisma.dailySales.findMany({orderBy:{date:'asc'}}),financialRows);
 console.log('PASS isolated PostgreSQL: exact food consumption, missing fields, approval/correction audit, UNIQUE P2002, concurrent retries, stale versions, access/restaurant isolation, invoice allocation and period validation; purchasing allowance/percentages/forecasts/sales unchanged.');

 // A real stored previous period powers the comparison; no generated chart figures.
 const previousForm=form();previousForm.set('from','2026-10-19');previousForm.set('to','2026-10-25');previousForm.delete('invoiceId');
 const previousPreview=await createFoodCostPreview(prisma,actor,previousForm);
 await approveFoodCost(prisma,actor,previousPreview.previewId!,false,'Synthetic previous period');
 // Real local UI against the disposable database. No worker can access Zonal.
 app=spawn('node',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3180'],{env:{...process.env,DATABASE_URL:url,DATABASE_POOL_SIZE:'3',PLAYWRIGHT_BROWSERS_PATH:join(root,'no-browser'),ZONAL_CREDENTIALS_KEY:randomBytes(32).toString('base64')},stdio:'ignore'});
 const base='http://localhost:3180';
 for(let n=0;n<100;n++){try{if((await fetch(base+'/login')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];
 page.on('pageerror',()=>errors.push('UI runtime error'));
 await page.goto(base+'/login');await page.getByLabel('Email address').fill('food-cost@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in to your kitchen'}).click();await expect(page).toHaveURL(/dashboard/);
 await page.goto(base+'/admin/stock-food-cost?from='+from+'&to='+to);
 await expect(page.getByRole('heading',{name:'Stock & Food Cost',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Automatic stock extraction unsupported',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Sync Stock from Zonal',exact:true})).toBeDisabled();
 await page.locator('#stock-opening').fill('700');
 await page.locator('input[name="complete"]').check();
 await page.getByRole('button',{name:'Preview Stock & Food Cost',exact:true}).click();
 await expect.poll(async()=>await prisma.foodCostPreview.count({where:{status:'PREVIEW',payload:{path:['opening'],equals:'70000'}}})).toBe(1);
 const uiPreview=await prisma.foodCostPreview.findFirstOrThrow({where:{status:'PREVIEW',payload:{path:['opening'],equals:'70000'}}});
 const review=page.locator('#stock-preview-'+uiPreview.id);
 await review.getByLabel('Approval / correction audit reason').fill('Explicit UI synthetic correction');
 await review.locator('input[name="overwrite"]').check();await review.locator('input[name="confirm"]').check();
 await review.getByRole('button',{name:'Approve correction',exact:true}).click();
 await expect.poll(async()=>await prisma.foodCostPreview.count({where:{id:uiPreview.id,status:'APPROVED'}})).toBe(1);
 await page.reload();
 await expect(page.getByText('Approved · Complete',{exact:true})).toBeVisible();
 await expect(page.getByText('29.00%',{exact:true})).toBeVisible();
 await expect(page.getByText('2.60%',{exact:true})).toBeVisible();
 await expect(page.getByText('26.40 percentage-point change',{exact:true})).toBeVisible();
 await page.screenshot({path:'/tmp/cocotte-stock-food-cost-test.png',fullPage:true});
 for(const width of [390,320]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await expect(page.getByText('Stock movement',{exact:true})).toBeVisible();
 await page.goto(base+'/stock');await expect(page.getByRole('link',{name:'Stock & Food Cost dashboard',exact:true})).toBeVisible();
 const anonymous=await browser.newPage();await anonymous.goto(base+'/admin/stock-food-cost');await expect(anonymous).toHaveURL(/login/);await anonymous.close();
 assert.deepEqual(errors,[]);
 assert.deepEqual((await financialWeek(actor.restaurantId,from,'2026-11-06',prisma)).finance,before.finance);

 // Synthetic approved Zonal Food departments are counted once per canonical day.
 for(const date of weekDays(from)){
  const payload={branch,date,currency:'GBP' as const,gross:'120000',discount:'0',vat:'20000',net:'100000',food:'80000',drink:'10000',specials:'10000',covers:1,transactions:1};
  await prisma.zonalImport.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,date:dateValue(date),branch,source:'ZONAL_BROWSER',status:'APPROVED',completedAt:new Date(),payload,fingerprint:fingerprint(payload),salesVersion:0}});
 }
 assert.equal((await zonalFoodSales(prisma,actor.restaurantId,from,to)).total,'560000');
 await prisma.dailySales.update({where:{restaurantId_date:{restaurantId:actor.restaurantId,date:dateValue(from)}},data:{version:{increment:1}}});
 assert.equal((await zonalFoodSales(prisma,actor.restaurantId,from,to)).total,null);
 const latest=await prisma.foodCostPeriod.findUniqueOrThrow({where:{restaurantId_from_to_category:{restaurantId:actor.restaurantId,from:dateValue(from),to:dateValue(to),category:'FOOD'}}}),saved=foodCostPayload.parse(latest.payload);
 await prisma.purchaseInvoice.update({where:{id:purchase.id},data:{amountPence:149999n}});
 assert.equal(foodCost(saved,await sourceIssues(prisma,actor.restaurantId,saved)).bps,null);
 const unconfirmed=await prisma.purchaseInvoice.create({data:{restaurantId:actor.restaurantId,supplierId:'supplier',reference:'TEST-PENDING',accountingDate:dateValue(from),amountPence:100n}});
 const pending=await createFoodCostPreview(prisma,actor,form('710'));
 await assert.rejects(approveFoodCost(prisma,actor,pending.previewId!,true,'Pending invoices'),/Unconfirmed/);
 assert(unconfirmed.id);
 console.log('PASS stock UI: explicit correction approval, real stored chart and 29% food cost, responsive 320/390px, navigation and anonymous protection. Verified Zonal Food denominator excludes drink/specials; manual edits invalidate stale Food evidence; invoice changes/unconfirmed invoices produce Incomplete Data.');
 console.log('Synthetic screenshot: /tmp/cocotte-stock-food-cost-test.png');
}finally{
 await browser?.close();app?.kill('SIGTERM');
 if(!poolClosed)await pool.end();
 await prisma.$disconnect();
 await exec('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);
 await rm(root,{recursive:true,force:true});
}
