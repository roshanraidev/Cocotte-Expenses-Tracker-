// Isolated preview worker: credentials in IPC memory; no console, files or sessions persisted.
import {chromium} from 'playwright';
import {loginSession} from '../../src/lib/zonal/browser-session.mjs';
import {allowDeliveryRequest,readDeliveries} from '../../src/lib/zonal/delivery-reader.mjs';
process.once('message',async input=>{
 const workerStarted=performance.now();
 const progress=(stage,index,total)=>process.send?.({type:'progress',stage,...(index?{index,total}:{})});
 let browser,context;let httpStatus=0;let code='BROWSER_FAILED';
 const cleanup=async()=>{input.credentials.password='';input.credentials.username='';await context?.clearCookies().catch(()=>{});await context?.close().catch(()=>{});await browser?.close().catch(()=>{});};
 process.once('SIGTERM',async()=>{await cleanup();process.exit(0);});
 try{
  browser=await chromium.launch({headless:true,timeout:12000,...(process.env.ZONAL_BROWSER_CHANNEL?{channel:process.env.ZONAL_BROWSER_CHANNEL}:{})});
  context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
  await context.route('**/*',async route=>{const r=route.request();if(!allowDeliveryRequest(new URL(r.url()),r.method(),r.resourceType(),r.postData()))return route.abort();return route.continue();});
  const page=await context.newPage();page.on('response',response=>{if(response.request().isNavigationRequest()&&response.request().frame()===page.mainFrame())httpStatus=response.status();});page.setDefaultTimeout(15000);
  const authenticationStarted=performance.now();const login=await loginSession(page,input.credentials,(stage)=>progress(stage));input.credentials.password='';input.credentials.username='';
  const authenticationMs=Math.round(performance.now()-authenticationStarted);
  if(login.code!=='AUTHENTICATED'){code=login.code;throw new Error(code);}
  const result=await readDeliveries(page,input.from,input.to,progress,input.registeredNames??[]);process.send?.({ok:true,...result,timings:{...result.timings,authenticationMs,matchingMs:0,totalMs:Math.round(performance.now()-workerStarted),cacheHit:false}});
 }catch(error){const allowed=['SESSION_EXPIRED','LOGIN_REJECTED','ACCESS_CONTROL','LOGIN_UNVERIFIED','REPORT_CHANGED','PERIOD_RANGE_UNAVAILABLE','BRANCH_NOT_VERIFIED','DELIVERY_NAVIGATION_CHANGED','DELIVERY_LAYOUT_CHANGED','DELIVERY_DATE_CHANGED','DELIVERY_AMOUNT_CHANGED','DELIVERY_IDENTITY_MISSING','PERIOD_LAYOUT_CHANGED','DELIVERY_CHANGED_BETWEEN_PERIODS','DELIVERY_LIMIT'];const network=String(error?.message??'').match(/\bERR_(?:NAME_NOT_RESOLVED|CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_TIMED_OUT|TIMED_OUT|CERT_AUTHORITY_INVALID|CERT_DATE_INVALID|ABORTED|FAILED|PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED)\b/)?.[0];process.send?.({ok:false,code:(httpStatus>=500?'HTTP_'+httpStatus:network)??(error?.name==='TimeoutError'?'TIMEOUT':allowed.includes(error?.message)?error.message:code)});}
 finally{await cleanup();process.disconnect?.();}
});
