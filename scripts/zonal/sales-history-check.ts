// Authorised, bounded read-only discovery. Never prints report values or session data.
import 'dotenv/config';
import {chromium} from 'playwright';
import {db} from '../../src/lib/db';
import {connectZonal} from '../../src/lib/zonal/connection-service';
import {loginSession} from '../../src/lib/zonal/browser-session.mjs';
import {allowZonalRequest} from '../../src/lib/zonal/network-policy.mjs';
import {openFinancialDetail,setFinancialParameters,REPORT_ROOT} from '../../src/lib/zonal/financial-detail.mjs';
import {parseFinancialDetail} from '../../src/lib/zonal/financial-parser.mjs';
import {addDays,londonToday,dateKey} from '../../src/lib/dates';
const prisma=db();
try{
 const actor=await prisma.user.findFirstOrThrow({where:{active:true,role:'SUPER_USER',restaurantId:'restaurant'},select:{id:true,restaurantId:true,role:true}});
 if(await prisma.zonalSyncBatch.count({where:{restaurantId:actor.restaurantId,status:'RUNNING'}}))throw new Error('ACTIVE_BATCH');
 const local=await prisma.dailySales.findMany({where:{restaurantId:actor.restaurantId},select:{date:true}});
 console.log('[history] canonical records',JSON.stringify({count:local.length,first:local.length?dateKey(local.sort((a,b)=>+a.date-+b.date)[0].date):null,last:local.length?dateKey(local.at(-1)!.date):null}));
 let metadata:{offeredFirst:string;offeredLast:string;offeredCount:number;verifiedDates:string[]}|undefined;
 const state=await connectZonal(prisma,actor,undefined,async(_id,credentials)=>{
  const browser=await chromium.launch({headless:true,timeout:12000});
  const timer=setTimeout(()=>void browser.close(),150000);
  const context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
  try{
   await context.route('**/*',async route=>{const r=route.request();await (allowZonalRequest(new URL(r.url()),r.method(),r.resourceType())?route.continue():route.abort());});
   let page=await context.newPage();page.setDefaultTimeout(15000);
   const login=await loginSession(page,credentials);if(login.code!=='AUTHENTICATED')return login;
   page=await openFinancialDetail(page);
   const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
   const dates=(await page.getByLabel('Start Date',{exact:true}).locator('option').allTextContents()).flatMap(text=>{
    const m=text.trim().match(/^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})\s+\([A-Za-z]{3}\)$/);if(!m)return[];
    const month=months.indexOf(m[2])+1;return month?[`${m[3]}-${String(month).padStart(2,'0')}-${m[1]}`]:[];
   }).filter(date=>date<=addDays(londonToday(),-1)).sort();
   if(!dates.length)return {code:'REPORT_DATE_UNAVAILABLE',loginVerified:true};
   metadata={offeredFirst:dates[0],offeredLast:dates.at(-1)!,offeredCount:dates.length,verifiedDates:[]};
   for(const date of [...new Set([dates[0],dates.at(-1)!])]){
    try{await setFinancialParameters(page,date);await page.locator(REPORT_ROOT).getByText('Net Sales',{exact:true}).first().waitFor({timeout:20000});parseFinancialDetail(await page.locator(REPORT_ROOT).innerText(),'003 – Parsons Green',date);metadata.verifiedDates.push(date);}catch{console.log('[history] report not validated',date);}
   }
   return {code:'AUTHENTICATED',loginVerified:true};
  }finally{clearTimeout(timer);await context.clearCookies().catch(()=>{});await browser.close();}
 });
 if(metadata)await prisma.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'ZONAL_SALES_HISTORY_DISCOVERED',entity:'Restaurant',entityId:actor.restaurantId,after:{...metadata,branch:'003 – Parsons Green'}}});
 console.log('[history]',JSON.stringify({loginVerified:state.loginVerified,availability:metadata??null}));
}catch(error){console.log('[history] unavailable:',error instanceof Error&&error.message==='ACTIVE_BATCH'?'ACTIVE_BATCH':'CONNECTION_OR_DISCOVERY_FAILED');process.exitCode=1;}finally{await prisma.$disconnect();}
