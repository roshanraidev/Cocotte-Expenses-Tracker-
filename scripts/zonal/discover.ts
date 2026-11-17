// Secure local discovery. Uses stored encrypted credentials, never accepts a password.
// No inspector, tracing, screenshots, storage files or raw error/page/request output.
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { db } from '../../src/lib/db';
import { connectZonal } from '../../src/lib/zonal/connection-service';
import { READ_ONLY_UI_POSTS } from '../../src/lib/zonal/network-policy.mjs';
import { LOGIN_URL, ORIGIN, loginSession, inspectLoginState } from '../../src/lib/zonal/browser-session.mjs';
delete process.env.DEBUG; delete process.env.PWDEBUG;
const { chromium } = await import('playwright');
const prisma = db();
const readline = createInterface({ input: stdin, output: stdout });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const operatorTimeout = new AbortController();
const deadline = setTimeout(() => operatorTimeout.abort(), 10 * 60 * 1000);
const observations = new Set<string>();
function structuralPath(path: string) {
  // Only fixed, reviewed UI paths may leave this process. Never emit dynamic URLs.
  const normalized=path.toLowerCase().replace(/\/+/g,'/');
  if(normalized===new URL(LOGIN_URL).pathname.toLowerCase()) return 'LOGIN_PAGE';
  if(normalized==='/portal/messages/dashboard') return 'PORTAL_DASHBOARD';
  if(normalized==='/reportbrowser/reports/reportframe.aspx') return 'REPORT_BROWSER';
  if(READ_ONLY_UI_POSTS.has(normalized)) return 'REVIEWED_UI_READ';
  return 'OTHER_OFFICIAL_PAGE';
}
try {
  const user = await prisma.user.findFirst({ where: { active: true, role: 'SUPER_USER', restaurantId: 'restaurant' }, select: { id:true, restaurantId:true, role:true } });
  if (!user) throw new Error();
  const result = await connectZonal(prisma,user,undefined,async (_id, credentials) => {
    browser = await chromium.launch({ headless: !process.argv.includes('--headed'), timeout: 12000 });
    const context = await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
    // Begin with the existing restrictive policy. UI-only read policy can be
    // reloaded in this same temporary session after reviewing observed endpoints.
    await context.route('**/*',async route=>{
      const r=route.request(),u=new URL(r.url());
      const { allowZonalRequest } = await import('../../src/lib/zonal/network-policy.mjs?discovery='+Date.now());
      const allowed=allowZonalRequest(u,r.method(),r.resourceType());
      if (!allowed) observations.add(JSON.stringify({kind:u.origin===ORIGIN?'BLOCKED_SAME_ORIGIN':'BLOCKED_EXTERNAL',method:['GET','HEAD','POST','PUT','DELETE','PATCH','OPTIONS'].includes(r.method())?r.method():'OTHER',resource:r.resourceType(),path:u.origin===ORIGIN?structuralPath(u.pathname):'EXTERNAL_ASSET_OR_AUTH',operation:u.origin===ORIGIN?u.pathname.match(/\.(?:aspx|asmx)\/((?:Get|List|Load)[A-Za-z]{1,70})$/i)?.[1]:undefined}));
      if (!allowed) return route.abort();
      await route.continue();
    });
    const page=await context.newPage(); page.setDefaultTimeout(10000);
    console.log('[zonal] DISCOVERY_SINGLE_LOGIN');
    let result=await loginSession(page,credentials);
    console.log('[zonal] RESULT', result.code);
    const summary=async()=>{
      for(const item of observations) console.log('[zonal] NETWORK_POLICY',item);
      const url=new URL(page.url());
      console.log('[zonal] PAGE_STRUCTURE',JSON.stringify({sameOrigin:url.origin===ORIGIN,path:structuralPath(url.pathname),loginVisible:await page.locator('#Content_LoginUser_password').isVisible(),links:await page.getByRole('link').count(),buttons:await page.getByRole('button').count(),images:await page.getByRole('img').count()}));
      // Public UI structure only: never emit account labels, values or report text.
      const known = ['Financial Detail', '003 – Parsons Green', 'Reports','Reporting','Financial','Logout','Log Out','Logoff','Sign Out','Home','Dashboard','Menu','Parsons Green'];
      console.log('[zonal] VISIBLE_NAV_LABELS',JSON.stringify(await Promise.all(known.map(async label=>({label,visible:await page.getByText(label,{exact:true}).filter({visible:true}).count()>0})))));

    };
    await summary();
    console.log('[zonal] Same temporary session retained. Commands: inspect, reload, verify, reports, financial, catalogue, controls, open-detail, finish. Headed mode permits human interaction on the official site only. No password input is read by this terminal.');
    try { while(true){
      const command=(await readline.question('discovery> ', { signal: operatorTimeout.signal })).trim();
      if(command==='finish') break;
      if(['catalogue','controls','open-detail'].includes(command)){
        const {reportDiscoveryAction}=await import('../../src/lib/zonal/report-discovery.mjs?inspection='+Date.now());
        console.log('[zonal] REPORT_STRUCTURE',JSON.stringify(await reportDiscoveryAction(page,command)));
      }
      else if(command==='inspect') await summary();
      else if(command==='verify'){result=await inspectLoginState(page);console.log('[zonal] RESULT',result.code);}
      else if(command==='reload'){
        if(new URL(page.url()).origin!==ORIGIN){console.log('[zonal] STOPPED_EXTERNAL_AUTH');continue;}
        // A GET reload of an existing authenticated destination; never resubmit the login form.
        if(new URL(page.url()).pathname.toLowerCase()===new URL(LOGIN_URL).pathname.toLowerCase()){console.log('[zonal] NO_LOGIN_RETRY');continue;}
        await page.goto(page.url(),{waitUntil:'domcontentloaded',timeout:15000});await page.waitForTimeout(2500);await summary();
      }else if(command==='financial'){
        if(result.code!=='AUTHENTICATED'){console.log('[zonal] LOGIN_NOT_VERIFIED');continue;}
        const financial=page.getByRole('link',{name:'Financial',exact:true});
        if(await financial.filter({visible:true}).count()===1){await financial.click();await page.waitForTimeout(1500);await summary();}else console.log('[zonal] FINANCIAL_CATEGORY_CONTROL_NOT_VERIFIED');
      }else if(command==='reports'){
        if(result.code!=='AUTHENTICATED'){console.log('[zonal] LOGIN_NOT_VERIFIED');continue;}
        // Discovery uses exact visible UI controls only, never constructed endpoints.
        const report=page.getByRole('link',{name:'Financial Detail',exact:true});
        if(await report.filter({visible:true}).count()===1){await report.click();await page.waitForTimeout(1500);await summary();}
        else { const menu=page.getByRole('link',{name:'Reports',exact:true}); if(await menu.filter({visible:true}).count()===1){await menu.click();await page.waitForTimeout(1500);await summary();}else console.log('[zonal] FINANCIAL_DETAIL_LINK_NOT_VERIFIED'); }
      }else console.log('[zonal] UNKNOWN_COMMAND');
    }
    } catch { console.log('[zonal] OPERATOR_SESSION_ENDED'); }
    await context.clearCookies();await context.close();
    return result;
  });
  console.log('[zonal] LOGIN_VERIFIED',result.loginVerified);
}catch{console.log('[zonal] DISCOVERY_STOPPED_SAFELY: check cooldown, browser/network setup or operator timeout. Raw details withheld.');process.exitCode=1;}
finally{clearTimeout(deadline);readline.close();await browser?.close();await prisma.$disconnect();}
