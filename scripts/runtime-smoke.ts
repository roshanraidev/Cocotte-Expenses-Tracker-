// Local read-only page smoke. Creates/removes only its own temporary auth session.
// Never logs credentials, tokens, page bodies or financial records.
import 'dotenv/config';
import { chromium,expect } from '@playwright/test';
import { Pool } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {londonToday,mondayOf,addDays} from '../src/lib/dates';
import {formatGBP} from '../src/lib/money';
import { createHash,randomBytes } from 'node:crypto';
const base='http://localhost:3000';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const sessionId='runtime-check-'+randomBytes(12).toString('hex');
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
async function snapshot(){
 const result:Record<string,string>={};
 for(const table of ['DailySales','WeeklyForecast','ForecastDay','SupplierOrder','SupplierOrderItem','PurchaseInvoice','Recipe','User','ZonalConnection']){
  const row=await pool.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) AS digest FROM "${table}" t`);
  result[table]=row.rows[0].digest;
 }
 return result;
}
try{
 const before=await snapshot();
 await prisma.zonalSyncBatch.findMany({take:1,include:{days:{include:{preview:true}}}});
 await prisma.zonalSyncDay.count();
 console.log('PASS PostgreSQL connectivity, generated batch delegates and batch/day/preview relational query.');
 expect(await prisma.zonalConnection.count({where:{encryptedCredentials:{not:null}}})).toBeGreaterThan(0);
 const admin=(await pool.query('SELECT id,"restaurantId" FROM "User" WHERE role=$1 AND active=true LIMIT 1',['SUPER_USER'])).rows[0];
 if(!admin)throw new Error('Existing Super User required.');
 const token=randomBytes(32).toString('hex');
 await pool.query('INSERT INTO "Session" (id,"tokenHash","userId","expiresAt") VALUES ($1,$2,$3,now()+interval \'5 minutes\')',[sessionId,createHash('sha256').update(token).digest('hex'),admin.id]);
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext();
 await context.addCookies([{name:'restaurant-session',value:token,url:base,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();
 const errors:string[]=[];
 page.on('pageerror',()=>errors.push('Browser runtime error'));
 page.on('console',async message=>{
  if(message.type()!=='error')return;
  errors.push('Console error');
  // Only this known nonsensitive exception and its code stack are diagnostic output.
  for(const arg of message.args()){
   const stack=await arg.evaluate(value=>value instanceof Error&&value.message==="Cannot read properties of undefined (reading 'findMany')"?value.stack:null).catch(()=>null);
   if(stack)console.error('CONFIRMED SERVER STACK:',stack);
  }
 });
 for(const [path,heading] of [['/admin/integrations/zonal','Zonal Connect'],['/dashboard','Dashboard'],['/sales','Daily Sales'],['/admin/planning','Weekly Planning'],['/reports','Reports'],['/recipes','Recipes']]){
  const response=await page.goto(base+path);
  expect(response?.status()).toBe(200);
  if(path==='/dashboard'){
   await expect(page.locator('h1.page-title')).toBeVisible();await expect(page.getByText('Here’s your kitchen update for this week.',{exact:true})).toBeVisible();
   await expect(page.getByRole('heading',{name:'Weekly Sales Overview',exact:true})).toBeVisible();
   const monday=mondayOf(londonToday());
   const totals=await pool.query('SELECT COALESCE(sum("amountPence"),0)::text AS pence FROM "DailySales" WHERE "restaurantId"=$1 AND date BETWEEN $2::date AND $3::date',[admin.restaurantId,monday,addDays(monday,6)]);
   const actual=await page.locator('[data-sales-kpi="net"]').innerText();
   if(actual!==formatGBP(BigInt(totals.rows[0].pence)))throw new Error('Dashboard recorded net differs from canonical Daily Sales.');
   console.log('PASS localhost dashboard Weekly Sales Overview total matches canonical Daily Sales for the selected current week.');
  }
  else await expect(page.getByRole('heading',{name:heading,exact:true}).first()).toBeVisible();
  expect(await page.getByText('We couldn’t complete that request',{exact:false}).count()).toBe(0);
  if(path.includes('zonal')){
   await expect(page.getByRole('heading',{name:'Sync Zonal',exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'Sync Zonal',exact:true})).toBeVisible();
   for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:950});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   }
  }
  console.log('PASS localhost',path,'HTTP 200, page heading and no error boundary');
 }
 expect(errors).toEqual([]);
 expect(await snapshot()).toEqual(before);
 console.log('PASS existing financial records, forecasts, recipes, accounts and encrypted Zonal connection unchanged.');
}catch(error){console.error('Local page smoke failed:',error instanceof Error?error.message:'Unknown failure');process.exitCode=1;}
finally{
 await browser?.close();
 await pool.query('DELETE FROM "Session" WHERE id=$1',[sessionId]);
 await prisma.$disconnect();
 await pool.end();
}
