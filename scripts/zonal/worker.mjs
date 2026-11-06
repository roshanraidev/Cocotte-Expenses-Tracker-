// Dedicated child process: credentials and raw browser output never reach stdout.
import { chromium, errors } from 'playwright';
import { ORIGIN, loginSession } from '../../src/lib/zonal/browser-session.mjs';
import { openFinancialDetail,setFinancialParameters,REPORT_ROOT } from '../../src/lib/zonal/financial-detail.mjs';
import { parseFinancialDetail } from '../../src/lib/zonal/financial-parser.mjs';
import { allowZonalRequest } from '../../src/lib/zonal/network-policy.mjs';
let browser, context;
let finished = false;
let verifiedLogin=false;
let currentStage = 'BROWSER_LAUNCH';
const emitted = new Set();
function diagnostic(stage, reason) {
  const key = `${stage}:${reason}`;
  if (emitted.has(key) || emitted.size >= 35) return;
  emitted.add(key);
  if (process.connected) { try { process.send({ type: 'diagnostic', stage, reason }); } catch { /* Parent closed. */ } }
}
function stage(name, reason) { currentStage = name; diagnostic(name, reason); }
async function finish(result) {
  if(verifiedLogin)result={...result,loginVerified:true};
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  diagnostic('CLEANUP','STARTED');
  try { await context?.clearCookies(); } catch { /* Context close destroys session data. */ }
  try { await context?.close(); } catch { /* Browser close is the final cleanup. */ }
  try { await browser?.close(); } catch { /* Parent enforces the process deadline. */ }
  diagnostic('CLEANUP','OK');
  try { if (process.connected) await new Promise(resolve => process.send(result, () => resolve())); } catch { /* Parent gone. */ }
  process.exit(0);
}
const deadline = setTimeout(() => { diagnostic(currentStage,'TIMEOUT'); void finish({code:'TIMEOUT'}); }, process.argv[2]==='extract'?90000:35000);
process.on('SIGTERM', () => { diagnostic(currentStage,'TIMEOUT'); void finish({code:'TIMEOUT'}); });
try {
  if (!['login','extract'].includes(process.argv[2])) await finish({ code: 'EXTRACTION_UNVERIFIED' });
  const username = process.env.ZONAL_USERNAME, password = process.env.ZONAL_PASSWORD;
  if (!username || !password) await finish({ code: 'NOT_CONFIGURED' });
  stage('BROWSER_LAUNCH','STARTED');
  browser = await chromium.launch({headless:true, timeout:12000, ...(process.env.ZONAL_BROWSER_CHANNEL==='chrome'?{channel:'chrome'}:{})});
  diagnostic('BROWSER_LAUNCH','OK');
  context = await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const r=route.request(), url=new URL(r.url());
    if(!allowZonalRequest(url,r.method(),r.resourceType())) {
      const reason = url.origin!==ORIGIN ? (r.isNavigationRequest()?'EXTERNAL_AUTH_BLOCKED':'EXTERNAL_ASSET_BLOCKED') : r.method()==='POST'?'UNRECOGNISED_POST_BLOCKED':'METHOD_BLOCKED';
      diagnostic('NETWORK_POLICY',reason);
      try { await route.abort(); } catch { /* Context already closed. */ }
      return;
    }
    try { await route.continue(); } catch { /* Context already closed. */ }
  });
  let page=await context.newPage();page.setDefaultTimeout(15000);
  const login=await loginSession(page,{username,password},stage);
  verifiedLogin=login.code==='AUTHENTICATED';
  if(login.code!=='AUTHENTICATED'||process.argv[2]!=='extract')await finish(login);
  try {
    const date=process.argv[3];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('DATE_UNAVAILABLE');
    page=await openFinancialDetail(page,stage);
    await setFinancialParameters(page,date,stage);
    await page.locator(REPORT_ROOT).getByText('Branch: 003 - Parsons Green',{exact:true}).waitFor({state:'visible',timeout:30000});
    await page.locator(REPORT_ROOT).getByText('Net Sales',{exact:true}).first().waitFor({state:'visible',timeout:10000});
    stage('REPORT_PARSE','STARTED');
    const text=await page.locator(REPORT_ROOT).innerText();
    const report=parseFinancialDetail(text,'003 – Parsons Green',date);
    diagnostic('REPORT_PARSE','OK');
    await finish({code:'REPORT_EXTRACTED',loginVerified:true,report});
  } catch(error) {
    diagnostic(currentStage,error instanceof errors.TimeoutError?'TIMEOUT':'VALIDATION_FAILED');
    await finish({code:error?.message==='DATE_UNAVAILABLE'?'REPORT_DATE_UNAVAILABLE':'REPORT_INVALID',loginVerified:true});
  }
} catch(error) {
  diagnostic(currentStage,error instanceof errors.TimeoutError?'TIMEOUT':currentStage==='LOGIN_PAGE'?'NAVIGATION_FAILED':'BROWSER_FAILED');
  await finish({code:error instanceof errors.TimeoutError?'TIMEOUT':'BROWSER_FAILED'});
}
