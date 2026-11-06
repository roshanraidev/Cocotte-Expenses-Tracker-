// One authorised discovery report. No credential, cookie, URL or report figures printed.
import 'dotenv/config';
import { db } from '../../src/lib/db';
import { connectZonal } from '../../src/lib/zonal/connection-service';
import { loginSession } from '../../src/lib/zonal/browser-session.mjs';
import { openFinancialDetail,setFinancialParameters,REPORT_ROOT } from '../../src/lib/zonal/financial-detail.mjs';
import { allowZonalRequest } from '../../src/lib/zonal/network-policy.mjs';
import { parseFinancialDetail } from '../../src/lib/zonal/financial-parser.mjs';
delete process.env.DEBUG; delete process.env.PWDEBUG;
const {chromium,errors}=await import('playwright');
const prisma=db();
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
let stage='START';
const mark=(s:string,r:string)=>{stage=s;console.log('[zonal-report]',s,r)};
const timer=setTimeout(()=>void browser?.close(),120000);
try{
 const actor=await prisma.user.findFirst({where:{active:true,role:'SUPER_USER',restaurantId:'restaurant'},select:{id:true,restaurantId:true,role:true}});
 if(!actor)throw new Error();
 await connectZonal(prisma,actor,undefined,async(_id,credentials)=>{
  browser=await chromium.launch({headless:true});const context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const r=route.request(),u=new URL(r.url());if(!allowZonalRequest(u,r.method(),r.resourceType())){
    const op=u.pathname.match(/\.(?:aspx|asmx)\/((?:Get|List|Load)[A-Za-z]{1,70})$/i)?.[1];
    if(u.origin==='https://mm.zonalconnect.com' && op)console.log('[zonal-report] BLOCKED_UI_READ',op);
    return route.abort();
   }await route.continue();
  });
  let page=await context.newPage();page.setDefaultTimeout(15000);
  const login=await loginSession(page,credentials,mark);if(login.code!=='AUTHENTICATED')return login;
  try{
   page=await openFinancialDetail(page,mark);
   await setFinancialParameters(page,'2026-11-03',mark);
   await page.waitForTimeout(5000);
   const text=await page.locator(REPORT_ROOT).innerText();
   const parsed=parseFinancialDetail(text,'003 – Parsons Green','2026-11-03');
   console.log('[zonal-report] VALIDATED_FIELDS',Object.keys(parsed).join(', '));
  }catch(e){console.log('[zonal-report] STOPPED',stage,e instanceof errors.TimeoutError?'TIMEOUT':'CONTROL_OR_STRUCTURE_ERROR');}
  return login;
 });
}catch{console.log('[zonal-report] STOPPED_SAFELY');process.exitCode=1;}
finally{clearTimeout(timer);await browser?.close();await prisma.$disconnect()}
