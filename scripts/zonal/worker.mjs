// Dedicated child process: credentials and raw browser output never reach stdout.
import { chromium, errors } from 'playwright';
import { ORIGIN, loginSession, inspectLoginState } from '../../src/lib/zonal/browser-session.mjs';
import { openFinancialDetail,setFinancialParameters,REPORT_ROOT } from '../../src/lib/zonal/financial-detail.mjs';
import { parseFinancialDetail,FINANCIAL_ERROR_CODES } from '../../src/lib/zonal/financial-parser.mjs';
import { allowZonalRequest } from '../../src/lib/zonal/network-policy.mjs';
let browser, context;
let finished = false;
let verifiedLogin=false;
let accessBlocked=false;
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
const deadline = setTimeout(() => { diagnostic(currentStage,'TIMEOUT'); void finish({code:'TIMEOUT'}); }, process.argv[2]==='stock'?60000:['batch','week'].includes(process.argv[2])?895000:['extract','latest'].includes(process.argv[2])?90000:35000);
process.on('disconnect', () => { void finish({code:'TIMEOUT'}); });
process.on('SIGTERM', () => { diagnostic(currentStage,'TIMEOUT'); void finish({code:'TIMEOUT'}); });
try {
  if (!['login','extract','latest','batch','week','stock'].includes(process.argv[2])) await finish({ code: 'EXTRACTION_UNVERIFIED' });
  const username = process.env.ZONAL_USERNAME, password = process.env.ZONAL_PASSWORD;
  if (!username || !password) await finish({ code: 'NOT_CONFIGURED' });
  stage('BROWSER_LAUNCH','STARTED');
  browser = await chromium.launch({headless:true, timeout:12000, ...(process.env.ZONAL_BROWSER_CHANNEL==='chrome'?{channel:'chrome'}:{})});
  diagnostic('BROWSER_LAUNCH','OK');
  context = await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
  context.on('response',response=>{if(new URL(response.url()).origin===ORIGIN&&[401,403,429].includes(response.status()))accessBlocked=true;});
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
  if(login.code!=='AUTHENTICATED'||process.argv[2]==='login')await finish(login);

  if(process.argv[2]==='stock'){
    const {discoverStockReports}=await import('../../src/lib/zonal/stock-discovery.mjs');
    try{await finish({code:'STOCK_UNSUPPORTED',stockDiscovery:await discoverStockReports(page,stage)});}catch{await finish({code:'STOCK_UNSUPPORTED'});}
  }
  const dashboardUrl=page.url();
  let dates=['batch','week'].includes(process.argv[2])?process.argv[3].split(','):[process.argv[3]];
  let reportOpen=false;
  let weeklyLatest;
  if(process.argv[2]==='week'){
    page=await openFinancialDetail(page,stage);reportOpen=true;
    const {availableReportDates}=await import('../../src/lib/zonal/report-dates.mjs');
    const available=availableReportDates(await page.getByLabel('Start Date',{exact:true}).locator('option').allTextContents(),dates.at(-1));
    const {weeklyAvailability}=await import('../../src/lib/zonal/report-dates.mjs');
    weeklyLatest=weeklyAvailability(dates,available).latest;
  }
  if(process.argv[2]==='latest'){
    page=await openFinancialDetail(page,stage);reportOpen=true;
    const {availableReportDates}=await import('../../src/lib/zonal/report-dates.mjs');
    const available=availableReportDates(await page.getByLabel('Start Date',{exact:true}).locator('option').allTextContents(),process.argv[3]);
    if(!available.length)await finish({code:'REPORT_DATE_UNAVAILABLE'});
    dates=[available.at(-1)];
  }
  for(const date of dates){
    if(process.argv[2]==='week'&&(!weeklyLatest||date>weeklyLatest)){
      if(process.connected)await new Promise(resolve=>process.send({type:'batch-day',date,result:{code:'REPORT_DATE_UNAVAILABLE',loginVerified:true,failureReason:'REPORT_AFTER_LATEST'}},resolve));
      continue;
    }
    let result;
    const dayDeadline=setTimeout(()=>{for(const active of context.pages())void active.close().catch(()=>{});},60000);
    try {
    if(date!==dates[0]){
      reportOpen=false;
      for(const old of context.pages())await old.close();
      page=await context.newPage();page.setDefaultTimeout(15000);
      const response=await page.goto(dashboardUrl,{waitUntil:'domcontentloaded',timeout:15000});
      if([401,403,429].includes(response?.status())||(await inspectLoginState(page)).code==='ACCESS_CONTROL')await finish({code:'ACCESS_CONTROL',loginVerified:true});
      if(await page.locator('#Content_LoginUser_password').isVisible())await finish({code:'LOGIN_UNVERIFIED'});
    }
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('DATE_UNAVAILABLE');
      if(!reportOpen)page=await openFinancialDetail(page,stage);
      await setFinancialParameters(page,date,stage);
      await page.locator(REPORT_ROOT).getByText('Branch: 003 - Parsons Green',{exact:true}).waitFor({state:'visible',timeout:20000});
      await page.waitForFunction(root=>/^Page\s+\d+\s+of\s+\d+$/m.test(document.querySelector(root)?.innerText??''),REPORT_ROOT,{timeout:20000});
      if(accessBlocked||(await inspectLoginState(page)).code==='ACCESS_CONTROL')await finish({code:'ACCESS_CONTROL'});
      if(await page.locator('#Content_LoginUser_password').isVisible())await finish({code:'LOGIN_UNVERIFIED'});
      stage('REPORT_PARSE','STARTED');
      const report=parseFinancialDetail(await page.locator(REPORT_ROOT).innerText(),'003 – Parsons Green',date);
      result={code:'REPORT_EXTRACTED',loginVerified:true,report};
    }catch(error){
      diagnostic(currentStage,error instanceof errors.TimeoutError?'TIMEOUT':'VALIDATION_FAILED');
      if(accessBlocked||(await inspectLoginState(page).catch(()=>({code:'LOGIN_UNVERIFIED'}))).code==='ACCESS_CONTROL')await finish({code:'ACCESS_CONTROL'});
      const failureReason=error instanceof errors.TimeoutError?'REPORT_RENDER_TIMEOUT':FINANCIAL_ERROR_CODES.includes(error?.message)?error.message:undefined;
      result={code:error?.message==='DATE_UNAVAILABLE'?'REPORT_DATE_UNAVAILABLE':error instanceof errors.TimeoutError?'TIMEOUT':'REPORT_INVALID',loginVerified:true,...(failureReason?{failureReason}:{})};
    }
    clearTimeout(dayDeadline);
    if(!['batch','week'].includes(process.argv[2]))await finish(result);
    if(process.connected)await new Promise(resolve=>process.send({type:'batch-day',date,result},resolve));
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  await finish({code:'AUTHENTICATED',loginVerified:true});

} catch(error) {
  diagnostic(currentStage,error instanceof errors.TimeoutError?'TIMEOUT':currentStage==='LOGIN_PAGE'?'NAVIGATION_FAILED':'BROWSER_FAILED');
  await finish({code:error instanceof errors.TimeoutError?'TIMEOUT':'BROWSER_FAILED'});
}
