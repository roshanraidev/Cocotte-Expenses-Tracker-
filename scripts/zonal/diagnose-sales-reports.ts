// Bounded read-only diagnosis. Prints only allowlisted parser codes and structural flags.
import 'dotenv/config';
import {chromium} from 'playwright';
import {db} from '../../src/lib/db';
import {connectZonal} from '../../src/lib/zonal/connection-service';
import {loginSession} from '../../src/lib/zonal/browser-session.mjs';
import {allowZonalRequest} from '../../src/lib/zonal/network-policy.mjs';
import {openFinancialDetail,setFinancialParameters,REPORT_ROOT} from '../../src/lib/zonal/financial-detail.mjs';
import {ZonalError} from '../../src/lib/zonal/validation';
import {parseFinancialDetail} from '../../src/lib/zonal/financial-parser.mjs';
const prisma=db();try{
 const actor=await prisma.user.findFirstOrThrow({where:{restaurantId:'restaurant',active:true,role:'SUPER_USER'},select:{id:true,restaurantId:true,role:true}});
 if(await prisma.zonalSyncBatch.count({where:{restaurantId:actor.restaurantId,status:'RUNNING',heartbeatAt:{gt:new Date(Date.now()-120000)}}}))throw new Error('SOURCE_BUSY');
 const state=await connectZonal(prisma,actor,undefined,async(_id,credentials)=>{
  const browser=await chromium.launch({headless:true,timeout:12000});const deadline=setTimeout(()=>void browser.close(),180000);const context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});const responses:{status:number;count:number}[]=[];
  try{
   context.on('response',r=>{if([401,403,429].includes(r.status())){const row=responses.find(s=>s.status===r.status());if(row)row.count++;else responses.push({status:r.status(),count:1});}});
   await context.route('**/*',async route=>{const r=route.request();await (allowZonalRequest(new URL(r.url()),r.method(),r.resourceType())?route.continue():route.abort());});
   let page=await context.newPage();page.setDefaultTimeout(15000);const login=await loginSession(page,credentials);if(login.code!=='AUTHENTICATED')return login;const dashboard=page.url();
   for(const date of ['2025-05-13']){
    try{
     if(date!=='2022-12-24'){for(const old of context.pages())await old.close();page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(dashboard,{waitUntil:'domcontentloaded',timeout:15000});}
     page=await openFinancialDetail(page);await setFinancialParameters(page,date);await page.locator(REPORT_ROOT).waitFor({state:'visible',timeout:20000});await page.locator(REPORT_ROOT).getByText('Net Sales',{exact:true}).first().waitFor({timeout:20000}).catch(()=>{});
     const text=await page.locator(REPORT_ROOT).innerText();let code='VALID';try{parseFinancialDetail(text,'003 – Parsons Green',date);}catch(error){const message=error instanceof Error?error.message:'';code=/^REPORT_[A-Z_]+$/.test(message)?message:'VALIDATION_FAILED';}
     const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),field=(label:string)=>{const i=lines.indexOf(label);return i<0?'':lines[i+1];};
     const money=(v:string)=>/^£[\d,]+\.\d{2}$/.test(v)?BigInt(v.replace(/[£,.]/g,'')):null;
     const gross=money(field('Gross Sales')),vat=money(field('VAT')),net=money(field('Net Sales')),before=money(field('Gross Sales Incl Disc')),discount=money(field('Discount'));
     console.log(JSON.stringify({date,code,hasFood:lines.includes('Food'),hasDrink:lines.includes('Drink'),hasSpecials:lines.includes('SPECIALS'),sourceErrorCodes:['rsProcessingAborted','rsRuntimeErrorInExpression','rsErrorExecutingCommand'].filter(code=>text.includes(code)),sourceDivideByZero:/divide by zero|division by zero/i.test(text),singlePage:lines.some(s=>/^Page\s+1\s+of\s+1$/.test(s)),hasSignedMoney:/-£|£-|\(£/.test(text),zeroSales:net===0n,grossVatExact:gross!==null&&vat!==null&&net!==null?gross-vat===net:null,discountExact:before!==null&&gross!==null&&discount!==null?before-discount===gross:null,departmentMarkers:lines.slice(lines.indexOf('Sales Departments')+10).flatMap((label,offset)=>['Food','Drink','SPECIALS','Totals'].includes(label)?[{label,offset}]:[]).slice(0,6),otherDepartmentLabels:lines.slice(lines.indexOf('Sales Departments')+10,lines.indexOf('Totals',lines.indexOf('Sales Departments')+10)).filter(label=>/^[A-Za-z][A-Za-z &/-]{0,35}$/.test(label)&&!['Food','Drink','SPECIALS'].includes(label)),miscellaneousNetZero:lines.indexOf('Miscellaneous')>=0?money(lines[lines.indexOf('Miscellaneous')+6])===0n:null,miscellaneousAmountsPresent:lines.indexOf('Miscellaneous')>=0?[2,3,4,5,6].every(offset=>money(lines[lines.indexOf('Miscellaneous')+offset])!==null):null,noDataMessage:/no data|no records|no rows|no sales/i.test(text),summaryFields:['Gross Sales Incl Disc','Gross Sales','Discount','VAT','Net Sales','Covers','Transaction Count'].filter(label=>lines.includes(label))}));
    }catch(error){console.log(JSON.stringify({date,code:error instanceof Error&&error.message==='DATE_UNAVAILABLE'?'DATE_UNAVAILABLE':'NAVIGATION_OR_TIMEOUT'}));}
   }
   console.log(JSON.stringify({authentication:'VERIFIED',accessResponses:responses}));return {code:'AUTHENTICATED',loginVerified:true};
  }finally{clearTimeout(deadline);await context.clearCookies().catch(()=>{});await browser.close();}
 });console.log(JSON.stringify({loginVerified:state.loginVerified}));
}catch(error){console.log(error instanceof ZonalError?error.message:error instanceof Error&&error.message==='SOURCE_BUSY'?'SOURCE_BUSY':'Read-only diagnosis unavailable; no repeated login attempted.');process.exitCode=1;}finally{await prisma.$disconnect();}
