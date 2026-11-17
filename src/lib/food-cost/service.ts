import 'server-only';
import {createHash} from 'node:crypto';
import type {PrismaClient,Prisma} from '@/generated/prisma/client';
import type {SalesActor} from '../sales-service';
import {assertAdmin} from '../policy';
import {dateValue,dateKey} from '../dates';
import {parsePounds} from '../money';
import {mappedBranch} from '../zonal/connection-service';
import {validateReport,reportInput,type Report} from '../zonal/validation';
import {foodCost,foodCostPayload,periodDates,FoodCostError,type FoodCostPayload} from './calculation';
type Client=PrismaClient|Prisma.TransactionClient;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const foodCostFingerprint=(p:FoodCostPayload)=>digest({...p,invoices:[...p.invoices].sort((a,b)=>a.id.localeCompare(b.id)),sales:[...p.sales].sort((a,b)=>a.date.localeCompare(b.date))});
const amount=(value:FormDataEntryValue|null)=>{
 if(value===null||String(value).trim()==='')return null;
 if(!/^\d{1,12}(\.\d{1,2})?$/.test(String(value)))throw new FoodCostError('Enter nonnegative GBP amounts with at most two decimal places; enter zero explicitly.');
 return parsePounds(String(value)).toString();
};
export async function invoiceSources(prisma:Client,restaurantId:string,from:string,to:string){
 return prisma.purchaseInvoice.findMany({where:{restaurantId,accountingDate:{gte:dateValue(from),lte:dateValue(to)},supplier:{restaurantId,foodWorkspace:true}},orderBy:[{accountingDate:'asc'},{id:'asc'}],select:{id:true,reference:true,amountPence:true,updatedAt:true,confirmedAt:true,voidedAt:true,accountingDate:true,supplier:{select:{name:true}}}});
}
export function invoiceUniverse(rows:Awaited<ReturnType<typeof invoiceSources>>){return digest(rows.map(r=>({id:r.id,amount:r.amountPence.toString(),updated:r.updatedAt.toISOString(),confirmed:r.confirmedAt?.toISOString()??null,voided:r.voidedAt?.toISOString()??null,date:dateKey(r.accountingDate)})));}
export async function zonalFoodSales(prisma:Client,restaurantId:string,from:string,to:string){
 const dates=periodDates(from,to);
 const sales=await prisma.dailySales.findMany({where:{restaurantId,date:{gte:dateValue(from),lte:dateValue(to)}}});
 const imports=await prisma.zonalImport.findMany({where:{restaurantId,status:'APPROVED',date:{gte:dateValue(from),lte:dateValue(to)}},orderBy:{completedAt:'desc'}});
 const branch=await mappedBranch(prisma as PrismaClient,restaurantId);
 const snapshots:FoodCostPayload['sales']=[];
 for(const date of dates){
  const sale=sales.find(s=>dateKey(s.date)===date);
  const record=imports.find(r=>dateKey(r.date)===date&&r.salesVersion+1===sale?.version);
  if(!sale||!record)continue;
  try{
   const report=validateReport(reportInput(record.payload as Report),branch,date);
   if(BigInt(report.net)!==sale.amountPence)continue;
   snapshots.push({date,importId:record.id,fingerprint:record.fingerprint,version:sale.version,food:report.food});
  }catch{/* Missing/unverified food data is never replaced by gross/net restaurant sales. */}
 }
 return {snapshots,total:snapshots.length===dates.length?snapshots.reduce((sum,r)=>sum+BigInt(r.food),0n).toString():null};
}
export async function sourceIssues(prisma:Client,restaurantId:string,p:FoodCostPayload){
 const issues:string[]=[];
 const rows=await invoiceSources(prisma,restaurantId,p.from,p.to);
 if(invoiceUniverse(rows)!==p.invoiceUniverse)issues.push('Invoice sources changed after review. Create and approve a fresh correction preview.');
 if(rows.some(r=>!r.confirmedAt&&!r.voidedAt))issues.push('Unconfirmed food-workspace invoices exist in this period; complete invoice review first.');
 for(const allocation of p.invoices){
  const r=rows.find(row=>row.id===allocation.id);
  if(!r||!r.confirmedAt||r.voidedAt||r.updatedAt.toISOString()!==allocation.updatedAt||r.amountPence.toString()!==allocation.total)issues.push('An allocated invoice is missing, unconfirmed, voided or changed.');
 }
 if(p.salesMode==='ZONAL'){
  const current=await zonalFoodSales(prisma,restaurantId,p.from,p.to);
  if(current.total!==p.foodSales||digest(current.snapshots)!==digest(p.sales))issues.push('Approved daily food sales are missing or changed. Refresh the preview.');
 }
 return issues;
}
export async function createFoodCostPreview(prisma:PrismaClient,actor:SalesActor,form:FormData){
 assertAdmin(actor.role);
 const from=String(form.get('from')??''),to=String(form.get('to')??'');
 periodDates(from,to);
 const restaurant=await prisma.restaurant.findUniqueOrThrow({where:{id:actor.restaurantId},select:{currency:true}});
 if(restaurant.currency!=='GBP')throw new FoodCostError('This reporting adapter supports GBP only.');
 const rows=await invoiceSources(prisma,actor.restaurantId,from,to);
 const ids=form.getAll('invoiceId').map(String);
 if(new Set(ids).size!==ids.length||ids.length>1000)throw new FoodCostError('Choose each invoice only once.');
 const invoices:FoodCostPayload['invoices']=ids.map(id=>{
  const row=rows.find(r=>r.id===id),food=amount(form.get('food-'+id));
  if(!row||!row.confirmedAt||row.voidedAt||food===null)throw new FoodCostError('Select only confirmed, nonvoid invoices in this restaurant and period, with an explicit food allocation.');
  const abs=row.amountPence<0n?-row.amountPence:row.amountPence;
  if(BigInt(food)>abs)throw new FoodCostError('A food allocation cannot exceed its invoice or credit value.');
  return {id,updatedAt:row.updatedAt.toISOString(),total:row.amountPence.toString(),food,credit:row.amountPence<0n};
 });
 const salesMode=form.get('salesMode')==='MANUAL'?'MANUAL':'ZONAL';
 const zonal=salesMode==='ZONAL'?await zonalFoodSales(prisma,actor.restaurantId,from,to):null;
 const payload=foodCostPayload.parse({from,to,category:'FOOD',currency:'GBP',opening:amount(form.get('opening')),closing:amount(form.get('closing')),transfersIn:amount(form.get('transfersIn')),transfersOut:amount(form.get('transfersOut')),foodSales:zonal?.total??(salesMode==='MANUAL'?amount(form.get('foodSales')):null),salesMode,stockReference:String(form.get('stockReference')??'').trim().slice(0,300),salesReference:String(form.get('salesReference')??'').trim().slice(0,300),complete:form.get('complete')==='on',invoiceUniverse:invoiceUniverse(rows),invoices,sales:zonal?.snapshots??[]});
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${actor.restaurantId} FOR UPDATE`;
  const existing=await tx.foodCostPeriod.findUnique({where:{restaurantId_from_to_category:{restaurantId:actor.restaurantId,from:dateValue(from),to:dateValue(to),category:'FOOD'}}});
  const hash=foodCostFingerprint(payload);
  if(existing?.fingerprint===hash)return {message:'Already Imported: approved stock period is unchanged.',previewId:null};
  const preview=await tx.foodCostPreview.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,from:dateValue(from),to:dateValue(to),category:'FOOD',payload,fingerprint:hash,expectedVersion:existing?.version??0}});
  await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'FOOD_COST_PREVIEWED',entity:'FoodCostPreview',entityId:preview.id,after:{from,to,source:'MANUAL_STOCK',category:'FOOD'}}});
  return {message:'Preview created. No stock approval or financial records changed.',previewId:preview.id};
 });
}
export async function approveFoodCost(prisma:PrismaClient,actor:SalesActor,id:string,overwrite:boolean,reason:string){
 assertAdmin(actor.role);
 return prisma.$transaction(async tx=>{
  // Same financial lock order; this reporting transaction never updates financial tables.
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${actor.restaurantId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "restaurantId" FROM "RestaurantSettings" WHERE "restaurantId"=${actor.restaurantId} FOR UPDATE`;
  const preview=await tx.foodCostPreview.findFirst({where:{id,restaurantId:actor.restaurantId}});
  if(!preview)throw new FoodCostError('Preview not found for this restaurant.');
  if(preview.status==='APPROVED')return 'Already approved; no changes made.';
  if(preview.status!=='PREVIEW'||Date.now()-preview.createdAt.getTime()>30*60000)throw new FoodCostError('Preview cancelled or expired. Create a new preview.');
  const parsed=foodCostPayload.safeParse(preview.payload);
  if(!parsed.success)throw new FoodCostError('Preview validation failed.');
  const p=parsed.data;
  if(p.from!==dateKey(preview.from)||p.to!==dateKey(preview.to)||p.category!==preview.category||foodCostFingerprint(p)!==preview.fingerprint)throw new FoodCostError('Period identity or preview integrity changed.');
  periodDates(p.from,p.to);
  const key={restaurantId_from_to_category:{restaurantId:actor.restaurantId,from:preview.from,to:preview.to,category:'FOOD'}};
  const existing=await tx.foodCostPeriod.findUnique({where:key});
  if(existing?.fingerprint===preview.fingerprint)return 'Already Imported; approved values are unchanged.';
  if((existing?.version??0)!==preview.expectedVersion)throw new FoodCostError('This stock period changed after preview. Create a fresh preview.');
  if(existing&&(!overwrite||reason.trim().length<3))throw new FoodCostError('Correction requires explicit Super User confirmation and an audit reason.');
  if(reason.trim().length<3)throw new FoodCostError('Add an approval evidence/audit reason (at least 3 characters).');
  const result=foodCost(p,await sourceIssues(tx,actor.restaurantId,p));
  if(!result.complete)throw new FoodCostError('Incomplete Data: '+result.issues.join(' '));
  const period=existing?await tx.foodCostPeriod.update({where:{...key,version:existing.version},data:{payload:p,fingerprint:preview.fingerprint,version:{increment:1},approvedById:actor.id,approvedAt:new Date()}}):await tx.foodCostPeriod.create({data:{restaurantId:actor.restaurantId,from:preview.from,to:preview.to,category:'FOOD',payload:p,fingerprint:preview.fingerprint,approvedById:actor.id}});
  await tx.foodCostPreview.update({where:{id:preview.id},data:{status:'APPROVED',periodId:period.id,completedAt:new Date()}});
  await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:existing?'FOOD_COST_CORRECTED':'FOOD_COST_APPROVED',entity:'FoodCostPeriod',entityId:period.id,...(existing?{before:existing.payload as Prisma.InputJsonValue}:{}),after:p,reason:reason.trim().slice(0,500)}});
  return 'Stock & Food Cost period approved. Purchasing budgets and Money Available to Spend are unchanged.';
 });
}
export async function foodCostReview(prisma:PrismaClient,actor:SalesActor,id:string){
 assertAdmin(actor.role);
 const preview=await prisma.foodCostPreview.findFirst({where:{id,restaurantId:actor.restaurantId,status:'PREVIEW'}});
 if(!preview)return null;
 const parsed=foodCostPayload.safeParse(preview.payload);
 if(!parsed.success)return null;
 const existing=await prisma.foodCostPeriod.findUnique({where:{restaurantId_from_to_category:{restaurantId:actor.restaurantId,from:preview.from,to:preview.to,category:'FOOD'}}});
 const issues=await sourceIssues(prisma,actor.restaurantId,parsed.data);
 if(Date.now()-preview.createdAt.getTime()>30*60000)issues.push('Preview expired; create a new preview.');
 if((existing?.version??0)!==preview.expectedVersion)issues.push('Approved period changed; create a new preview.');
 return {id:preview.id,existing,preview,payload:parsed.data,result:foodCost(parsed.data,issues)};
}

export async function cancelFoodCost(prisma:PrismaClient,actor:SalesActor,id:string){
 assertAdmin(actor.role);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${actor.restaurantId} FOR UPDATE`;
  const changed=await tx.foodCostPreview.updateMany({where:{id,restaurantId:actor.restaurantId,status:'PREVIEW'},data:{status:'CANCELLED',completedAt:new Date()}});
  if(changed.count)await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'FOOD_COST_CANCELLED',entity:'FoodCostPreview',entityId:id}});
  return 'Preview cancelled. Approved values are unchanged.';
 });
}
