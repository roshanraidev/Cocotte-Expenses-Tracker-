import 'server-only';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {z} from 'zod';
import {Prisma,type PrismaClient} from '@/generated/prisma/client';
import {decryptCredentials,type ZonalCredentials} from './crypto';
import {assertAdmin} from '../policy';
import type {SalesActor} from '../sales-service';
import {deliverySyncRange} from './delivery-range';
import {londonToday} from '../dates';
import {matchDelivery} from './delivery-matching';
const evidenceSchema=z.object({detailRead:z.boolean(),net:z.string().regex(/^-?\d{1,15}$/).nullable(),vat:z.string().regex(/^-?\d{1,15}$/).nullable(),supplierCode:z.string().max(100).nullable(),accepted:z.boolean().nullable(),electronic:z.boolean().nullable(),accrual:z.boolean().nullable(),lineCount:z.number().int().min(0).max(10000),manualPosted:z.boolean().optional(),manualChecks:z.object({manual:z.boolean(),nonAccrual:z.boolean(),manualSource:z.boolean(),receivedQuantities:z.boolean(),dateMatches:z.boolean()}).optional(),lineFingerprint:z.string().regex(/^[a-f0-9]{64}$/).optional(),contradictoryLineClassification:z.boolean().optional(),classificationVerified:z.boolean(),creditVerified:z.boolean(),reason:z.string().max(400).nullable()}).strict();
const timingSchema=z.object({authenticationMs:z.number().nonnegative(),navigationMs:z.number().nonnegative(),tableMs:z.number().nonnegative(),detailsMs:z.number().nonnegative(),matchingMs:z.number().nonnegative(),totalMs:z.number().nonnegative(),cacheHit:z.boolean()}).strict();
const amount=z.string().regex(/^-?\d{1,15}$/);
const resultSchema=z.object({ok:z.literal(true),records:z.array(z.object({id:z.string().min(1).max(150),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),supplier:z.string().min(1).max(254),document:z.string().min(1).max(254),items:amount,unknown:amount,invoice:amount,credit:amount,total:amount,period:z.string().max(100),evidence:evidenceSchema.optional()}).strict()).max(500),periods:z.array(z.string().max(100)).max(6),rowsChecked:z.number().int().min(0).max(3000),timings:timingSchema.optional()}).strict();
type WorkerResult=z.infer<typeof resultSchema>;
const previewCache=new Map<string,{result:WorkerResult;at:number;fetchedAt:string}>();
export function clearDeliveryPreviewCache(){previewCache.clear();}
export const deliveryErrors:Record<string,string>={SESSION_EXPIRED:'The temporary Zonal session expired. No login retry or purchase registration was attempted.',HTTP_500:'Zonal returned HTTP 500 while opening the login page.',HTTP_502:'Zonal returned HTTP 502 while opening the login page.',HTTP_503:'Zonal returned HTTP 503 while opening the login page.',HTTP_504:'Zonal returned HTTP 504 while opening the login page.',ERR_NAME_NOT_RESOLVED:'The server could not resolve the Zonal hostname.',ERR_CONNECTION_REFUSED:'The Zonal connection was refused.',ERR_CONNECTION_RESET:'The Zonal connection was reset.',ERR_CONNECTION_CLOSED:'Zonal closed the network connection.',ERR_TIMED_OUT:'The network connection to Zonal timed out.',ERR_CONNECTION_TIMED_OUT:'The network connection to Zonal timed out.',ERR_CERT_AUTHORITY_INVALID:'The Zonal TLS certificate could not be trusted by the browser.',ERR_CERT_DATE_INVALID:'The Zonal TLS certificate date was rejected.',ERR_ABORTED:'The Zonal page navigation was aborted.',ERR_FAILED:'The Zonal network request failed.',ERR_PROXY_CONNECTION_FAILED:'The server could not connect through its network proxy.',ERR_TUNNEL_CONNECTION_FAILED:'The proxy tunnel to Zonal failed.',TIMEOUT:'Zonal delivery retrieval timed out. The temporary browser was stopped; no purchases were changed.',LOGIN_REJECTED:'Zonal rejected the login. Check the connection before retrying.',ACCESS_CONTROL:'Zonal requires human interaction or denied access. No security challenge was bypassed.',LOGIN_UNVERIFIED:'The temporary Zonal login could not be verified.',REPORT_CHANGED:'The Zonal login page has changed.',PERIOD_RANGE_UNAVAILABLE:'The requested dates are not fully covered by the available Zonal stock periods. Choose a supported range; no partial preview was presented as complete.',BRANCH_NOT_VERIFIED:'Branch 003 Parsons Green could not be verified.',DELIVERY_CHANGED_BETWEEN_PERIODS:'A delivery changed while reading periods. Retry later after reviewing Zonal.',BROWSER_FAILED:'The Zonal browser could not complete delivery retrieval. Check the server browser setup.'};
export class DeliveryPreviewError extends Error{}
export function deliveryWorker(credentials:ZonalCredentials,from:string,to:string,registeredNames:string[]=[]):Promise<z.infer<typeof resultSchema>>{
 return new Promise((resolve,reject)=>{
  const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV};for(const key of ['PATH','HOME','TMPDIR','SYSTEMROOT','PLAYWRIGHT_BROWSERS_PATH','ZONAL_BROWSER_CHANNEL'])if(process.env[key])env[key]=process.env[key];
  const child=spawn(process.execPath,['scripts/zonal/delivery-worker.mjs'],{env,cwd:process.cwd(),detached:process.platform!=='win32',stdio:['ignore','ignore','ignore','ipc']});
  let result:z.infer<typeof resultSchema>|undefined,error:string|undefined;let stage='BROWSER_LAUNCH';
  let hardStop:ReturnType<typeof setTimeout>|undefined;const timer=setTimeout(()=>{error='TIMEOUT';child.kill('SIGTERM');hardStop=setTimeout(()=>{try{if(child.pid&&process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{/* Already closed. */}},5000);},180000);
  child.on('message',message=>{const progress=z.object({type:z.literal('progress'),stage:z.enum(['LOGIN_PAGE','LOGIN_FORM','LOGIN_SUBMIT','LOGIN_VERIFY','STOCK_NAVIGATION','DELIVERY_NAVIGATION','PERIOD_SELECTION','DELIVERY_ROWS','DELIVERY_EVIDENCE']),index:z.number().int().min(1).max(6).optional(),total:z.number().int().min(1).max(6).optional()}).strict().safeParse(message);if(progress.success){stage=progress.data.stage+(progress.data.index?' '+progress.data.index+' of '+progress.data.total:'');return;}const parsed=resultSchema.safeParse(message);if(parsed.success)result=parsed.data;else{const fail=z.object({ok:z.literal(false),code:z.string().max(80)}).strict().safeParse(message);error=fail.success?fail.data.code:'DELIVERY_LAYOUT_CHANGED';}});
  child.on('error',()=>{error='BROWSER_FAILED';});
  child.on('close',()=>{clearTimeout(timer);if(hardStop)clearTimeout(hardStop);if(result&&!error)resolve(result);else reject(new DeliveryPreviewError((deliveryErrors[error??'BROWSER_FAILED']??'The delivery layout, fields or amounts could not be validated. No purchases were changed.')+' Stage: '+stage.replaceAll('_',' ').toLowerCase()+'.'));});
  child.send({credentials,from,to,registeredNames},error=>{credentials.username='';credentials.password='';if(error){child.kill('SIGKILL');}});
 });
}
export async function previewZonalDeliveries(prisma:PrismaClient,actor:SalesActor,from:string,to:string,runner=deliveryWorker){
 const executionStarted=performance.now();assertAdmin(actor.role);deliverySyncRange(from,to,londonToday());
 // The shared restaurant lock also serializes sales-batch reservation and connection
 // changes. Bounded pilot preview only; never writes PurchaseInvoice or Supplier.
 return prisma.$transaction(async tx=>{
  const lock=await tx.$queryRaw<{locked:boolean}[]>(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`cocotte:zonal:delivery:${actor.restaurantId}`},0)) AS locked`);
  if(!lock[0]?.locked)throw new DeliveryPreviewError('A delivery preview is already running for this restaurant.');
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${actor.restaurantId} FOR UPDATE`;
  if(await tx.zonalSyncBatch.count({where:{restaurantId:actor.restaurantId,status:'RUNNING'}}))throw new DeliveryPreviewError('A sales sync is running. Wait for it to finish before fetching deliveries.');
  const connection=await tx.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId}});
  if(!connection?.encryptedCredentials)throw new DeliveryPreviewError('Connect Zonal in integration settings first.');
  if(connection.branch!=='003 – Parsons Green')throw new DeliveryPreviewError('This branch is not supported by the verified delivery reader.');
  const suppliers=await tx.supplier.findMany({where:{restaurantId:actor.restaurantId},select:{id:true,name:true,active:true,foodWorkspace:true,packagingWorkspace:true}});
  const supplierSignature=createHash('sha256').update(JSON.stringify([...suppliers].sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');
  const key=JSON.stringify([actor.restaurantId,connection.revision,from,to,supplierSignature]);
  for(const [entry,value] of previewCache)if(Date.now()-value.at>=30000)previewCache.delete(entry);
  const cached=previewCache.get(key);
  let extracted:WorkerResult;let fetchedAt:string;
  if(cached){extracted=cached.result;fetchedAt=cached.fetchedAt;}
  else{
   if(connection.lastAttemptAt&&Date.now()-connection.lastAttemptAt.getTime()<60000)throw new DeliveryPreviewError('Wait one minute between Zonal connection attempts.');
   await tx.zonalConnection.update({where:{restaurantId:actor.restaurantId},data:{lastAttemptAt:new Date()}});
   try{extracted=await runner(decryptCredentials(actor.restaurantId,connection.encryptedCredentials),from,to,suppliers.map(s=>s.name));}
   catch(error){return {error:error instanceof DeliveryPreviewError?error.message:'Unable to retrieve deliveries safely. No purchases were changed.',rows:[],periods:[],rowsChecked:0,fetchedAt:null};}
   fetchedAt=new Date().toISOString();
   if(previewCache.size>=8)previewCache.delete(previewCache.keys().next().value!);
   previewCache.set(key,{result:extracted,at:Date.now(),fetchedAt});
  }
  const matchingStarted=performance.now();
  const purchases=await tx.purchaseInvoice.findMany({where:{restaurantId:actor.restaurantId},select:{id:true,supplierId:true,reference:true,voidedAt:true}});
  const imports=await tx.zonalDeliveryImport.findMany({where:{restaurantId:actor.restaurantId,location:'003'},include:{purchase:{select:{voidedAt:true,amountPence:true,supplierId:true,reference:true,accountingDate:true}}}});
  const rows=extracted.records.map(r=>matchDelivery(r,suppliers,purchases,imports));
  const {protectDeliveryBatch}=await import('./delivery-import');await protectDeliveryBatch(tx,actor.restaurantId,rows);
  const timings={authenticationMs:cached?0:extracted.timings?.authenticationMs??0,navigationMs:cached?0:extracted.timings?.navigationMs??0,tableMs:cached?0:extracted.timings?.tableMs??0,detailsMs:cached?0:extracted.timings?.detailsMs??0,matchingMs:Math.round(performance.now()-matchingStarted),totalMs:Math.round(performance.now()-executionStarted),cacheHit:!!cached};
  const preview=await tx.zonalDeliveryPreview.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,from:new Date(from+'T00:00:00Z'),to:new Date(to+'T00:00:00Z'),connectionRevision:connection.revision,payload:JSON.parse(JSON.stringify(rows)),expiresAt:new Date(Date.now()+5*60000)}});
  await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'ZONAL_DELIVERY_PREVIEW',entity:'Restaurant',entityId:actor.restaurantId,after:{from,to,periods:extracted.periods.length,rows:rows.length,registrationEnabled:rows.some(r=>r.eligible),timings}}});
  return {previewId:preview.id,error:'',rows,periods:extracted.periods,rowsChecked:extracted.rowsChecked,fetchedAt,timings};
 },{timeout:200000,maxWait:3000});
}
