import 'server-only';
import {Prisma,type PrismaClient} from '@/generated/prisma/client';
import {assertAdmin} from '../policy';
import type {SalesActor} from '../sales-service';
import {dateKey,dateValue,londonToday,mondayOf} from '../dates';
import {assertOpen} from '../operations';
import {decryptCredentials} from './crypto';
import {deliveryWorker,DeliveryPreviewError,clearDeliveryPreviewCache} from './delivery-preview';
import {deliveryFingerprint} from './delivery-identity';
import {matchDelivery,invoiceReference,type DeliveryPreviewRow,type DeliveryRecord} from './delivery-matching';
export type DeliveryImportResult={imported:number;alreadyImported:number;review:number;unmatched:number;totalPence:string;error?:string;importedIds?:string[];reviewIds?:string[];replayed?:boolean};
export async function protectDeliveryBatch(tx:Prisma.TransactionClient,restaurantId:string,rows:DeliveryPreviewRow[]){
 const weeks=await tx.weeklyForecast.findMany({where:{restaurantId,finalizedAt:{not:null}},select:{weekStart:true}});
 const finalized=new Set(weeks.map(w=>dateKey(w.weekStart)));const references=new Map<string,number>();
 for(const r of rows)if(r.supplierId){const key=r.supplierId+':'+invoiceReference(r.document);references.set(key,(references.get(key)??0)+1);}
 for(const r of rows){if(!r.eligible)continue;const reason=finalized.has(mondayOf(r.date))?'This delivery belongs to a finalized week. Reopen it through the audited workflow.':(references.get(r.supplierId+':'+invoiceReference(r.document))??0)>1?'Multiple source deliveries share this supplier/invoice reference; consolidate or reconcile them before importing.':null;if(reason){r.eligible=false;r.status='Needs Review';r.reason=reason;r.reviewReasons.push(reason);}}
}
export async function importZonalDeliveries(prisma:PrismaClient,actor:SalesActor,previewId:string,reason:string,runner=deliveryWorker):Promise<DeliveryImportResult>{
 assertAdmin(actor.role);
 if(!/^[A-Za-z0-9_-]{10,100}$/.test(previewId))throw new DeliveryPreviewError('Choose a valid server-generated preview.');
 // Wait outside the financial transaction, after an explicit user click. This
 // honours the existing login cooldown without requiring a second approval.
 const owned=await prisma.zonalDeliveryPreview.findFirst({where:{id:previewId,restaurantId:actor.restaurantId,actorId:actor.id}});
 if(!owned)throw new DeliveryPreviewError('This preview is unavailable for your restaurant/user.');
 if(owned.status!=='APPROVED'){
  if(owned.expiresAt.getTime()<Date.now())throw new DeliveryPreviewError('This preview expired. Fetch deliveries again.');
  const last=await prisma.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId},select:{lastAttemptAt:true}});
  const remaining=last?.lastAttemptAt?60000-(Date.now()-last.lastAttemptAt.getTime()):0;
  if(remaining>0)await new Promise(resolve=>setTimeout(resolve,Math.min(remaining+50,60050)));
 }

 return prisma.$transaction(async tx=>{
  const lock=await tx.$queryRaw<{locked:boolean}[]>(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`cocotte:zonal:delivery:${actor.restaurantId}`},0)) AS locked`);
  if(!lock[0]?.locked)throw new DeliveryPreviewError('Another delivery job is running. Wait for it to finish.');
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${actor.restaurantId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "restaurantId" FROM "RestaurantSettings" WHERE "restaurantId"=${actor.restaurantId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "ZonalDeliveryPreview" WHERE id=${previewId} AND "restaurantId"=${actor.restaurantId} FOR UPDATE`;
  const preview=await tx.zonalDeliveryPreview.findFirst({where:{id:previewId,restaurantId:actor.restaurantId,actorId:actor.id}});
  if(!preview)throw new DeliveryPreviewError('This preview is unavailable for your restaurant/user.');
  if(preview.status==='APPROVED'){const prior=preview.result as unknown as DeliveryImportResult;return {...prior,imported:0,alreadyImported:prior.imported+prior.alreadyImported,totalPence:'0',replayed:true};}
  if(preview.expiresAt.getTime()<Date.now())throw new DeliveryPreviewError('This preview expired. Fetch deliveries again.');
  const stored=preview.payload as unknown as DeliveryPreviewRow[];if(!Array.isArray(stored))throw new DeliveryPreviewError('The preview cannot be validated. Fetch again.');
  const selected=stored.filter(r=>r.eligible);if(!selected.length)throw new DeliveryPreviewError('This preview has no eligible deliveries.');
  if(selected.some(r=>r.date<mondayOf(londonToday()))&&reason.trim().length<3)throw new DeliveryPreviewError('Enter an audit reason for historical purchases.');
  if(await tx.zonalSyncBatch.count({where:{restaurantId:actor.restaurantId,status:'RUNNING'}}))throw new DeliveryPreviewError('Wait for the running sales sync to finish.');
  const connection=await tx.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId}});
  if(!connection?.encryptedCredentials||connection.branch!=='003 – Parsons Green'||connection.revision!==preview.connectionRevision)throw new DeliveryPreviewError('The connection changed. Fetch a new preview.');
  if(connection.lastAttemptAt&&Date.now()-connection.lastAttemptAt.getTime()<60000)throw new DeliveryPreviewError('Wait one minute after the last login before confirming imports; source values must be checked again.');
  const suppliers=await tx.supplier.findMany({where:{restaurantId:actor.restaurantId},select:{id:true,name:true,active:true,foodWorkspace:true,packagingWorkspace:true}});
  await tx.zonalConnection.update({where:{restaurantId:actor.restaurantId},data:{lastAttemptAt:new Date()}});
  // Import never trusts client amounts or a cached source preview.
  let fresh;try{fresh=await runner(decryptCredentials(actor.restaurantId,connection.encryptedCredentials),dateKey(preview.from),dateKey(preview.to),suppliers.map(s=>s.name));}catch(error){return {imported:0,alreadyImported:0,review:selected.length,unmatched:0,totalPence:'0',error:error instanceof DeliveryPreviewError?error.message:'Zonal recheck failed. No purchases were registered.'};}
  const purchases=await tx.purchaseInvoice.findMany({where:{restaurantId:actor.restaurantId},select:{id:true,supplierId:true,reference:true,voidedAt:true}});
  const imports=await tx.zonalDeliveryImport.findMany({where:{restaurantId:actor.restaurantId,location:'003'},include:{purchase:{select:{amountPence:true,voidedAt:true,supplierId:true,reference:true,accountingDate:true}}}});
  const current=fresh.records.map(r=>matchDelivery(r,suppliers,purchases,imports));await protectDeliveryBatch(tx,actor.restaurantId,current);
  const result:DeliveryImportResult={imported:0,alreadyImported:0,review:stored.filter(r=>!r.eligible&&r.match!=='UNMATCHED').length,unmatched:stored.filter(r=>r.match==='UNMATCHED').length,totalPence:'0',importedIds:[],reviewIds:[]};let total=0n;
  for(const row of selected){
   const now=current.find(r=>r.id===row.id);
   if(now?.status==='Already Imported'){result.alreadyImported++;continue;}
   if(!now?.eligible||now.supplierId!==row.supplierId||deliveryFingerprint(now as DeliveryRecord)!==deliveryFingerprint(row)){result.review++;result.reviewIds!.push(row.id);continue;}
   await assertOpen(tx,actor.restaurantId,now.date);
   const reference=invoiceReference(now.document);
   // Also check conservative punctuation-normalised manual references.
   const key=reference.replace(/[^\p{L}\p{N}]/gu,'');
   if(purchases.some(p=>p.supplierId===now.supplierId&&invoiceReference(p.reference).replace(/[^\p{L}\p{N}]/gu,'')===key)){result.review++;result.reviewIds!.push(row.id);continue;}
   const purchase=await tx.purchaseInvoice.create({data:{restaurantId:actor.restaurantId,supplierId:now.supplierId!,reference,accountingDate:dateValue(now.date),amountPence:BigInt(now.verifiedNet!),confirmedAt:new Date()}});
   await tx.zonalDeliveryImport.create({data:{restaurantId:actor.restaurantId,supplierId:now.supplierId!,purchaseId:purchase.id,actorId:actor.id,location:'003',deliveryId:now.id,documentKey:reference,fingerprint:deliveryFingerprint(now)}});
   await tx.weeklyForecast.updateMany({where:{restaurantId:actor.restaurantId,weekStart:dateValue(mondayOf(now.date))},data:{purchasesConfirmedAt:null}});
   await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'ZONAL_DELIVERY_IMPORTED',entity:'PurchaseInvoice',entityId:purchase.id,after:JSON.parse(JSON.stringify({source:'ZONAL',branch:'003',deliveryId:now.id,document:now.document,deliveryDate:now.date,netPence:now.verifiedNet,classification:'FOOD',classificationBasis:'EXPLICIT_SUPPLIER_FOOD_PURCHASING',evidence:now.evidence})),reason:reason.trim()||'Explicit approval of verified Zonal deliveries'}});
   purchases.push({id:purchase.id,supplierId:now.supplierId!,reference:now.document,voidedAt:null});result.imported++;result.importedIds!.push(row.id);total+=purchase.amountPence;
  }
  result.totalPence=total.toString();await tx.zonalDeliveryPreview.update({where:{id:preview.id},data:{status:'APPROVED',result:JSON.parse(JSON.stringify(result))}});clearDeliveryPreviewCache();return result;
 },{timeout:200000,maxWait:3000});
}
