import 'server-only';
import {z} from 'zod';
import type {Prisma,PrismaClient} from '@/generated/prisma/client';
import type {SalesActor} from '../sales-service';
import {dateValue,londonToday,validDateKey} from '../dates';
import {parsePounds} from '../money';
import {keyOf,invoiceNumberKey,reviewSchema,reconcile} from './values';
import {validateDocument} from './document';
export class PackagingError extends Error{}
const str=z.string().trim().min(1).max(200);
const date=z.string().refine(validDateKey,'Choose a valid date.');
const json=(v:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x));
function admin(actor:SalesActor){if(actor.role!=='SUPER_USER')throw new PackagingError('Only Super Users can manage catalogue links or void invoices.');}
async function lock(tx:Prisma.TransactionClient,restaurantId:string){await tx.$queryRaw`SELECT "restaurantId" FROM "RestaurantSettings" WHERE "restaurantId"=${restaurantId} FOR UPDATE`;}
async function audit(tx:Prisma.TransactionClient,actor:SalesActor,action:string,entityId:string,before:unknown,after:unknown,reason?:string){await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action,entity:'Packaging',entityId,...(before?{before:json(before)}:{}),after:json(after),reason}});}
export async function registerInvoice(prisma:PrismaClient,actor:SalesActor,raw:unknown,file?:{bytes:Uint8Array;filename:string;mime:string},today=londonToday()){
 const v=z.object({supplierId:str,orderDate:date,deliveryDate:date,submissionKey:z.uuid()}).parse(raw);
 if(v.orderDate>today||v.deliveryDate>today||v.deliveryDate<v.orderDate)throw new PackagingError('Use received invoices: order and delivery dates must be today or earlier, with delivery on or after ordering.');
 const document=file?{...validateDocument(file.bytes,file.filename,file.mime),bytes:new Uint8Array(file.bytes)}:undefined;
 return prisma.$transaction(async tx=>{await lock(tx,actor.restaurantId);const existing=await tx.packagingInvoice.findUnique({where:{submissionKey:v.submissionKey}});if(existing){if(existing.restaurantId!==actor.restaurantId)throw new PackagingError('Reload the form.');return existing;}
 await tx.supplier.findFirstOrThrow({where:{id:v.supplierId,restaurantId:actor.restaurantId,active:true,packagingWorkspace:true}});
 const invoice=await tx.packagingInvoice.create({data:{restaurantId:actor.restaurantId,supplierId:v.supplierId,submissionKey:v.submissionKey,orderDate:dateValue(v.orderDate),deliveryDate:dateValue(v.deliveryDate),...(document?{document:{create:document}}:{scanNote:'Manual entry. Confirm all product lines and the net amount.'})}});
 await audit(tx,actor,'PACKAGING_INVOICE_REGISTERED',invoice.id,null,{supplierId:v.supplierId,orderDate:v.orderDate,deliveryDate:v.deliveryDate,document:document?{filename:document.filename,sha256:document.sha256}:null});return invoice;});
}
export async function saveReview(prisma:PrismaClient,actor:SalesActor,id:string,version:number,raw:unknown,confirm:boolean){
 const bounded=JSON.stringify(raw);if(bounded.length>180000)throw new PackagingError('Review is too large. Limit invoices to 150 product lines.');
 // Drafts intentionally retain incomplete editable values; only confirmation accepts financial data.
 const draft=z.object({invoiceNumber:z.string().max(100).optional(),invoiceDate:z.string().max(10).optional(),net:z.string().max(20).optional(),vat:z.string().max(20).optional(),gross:z.string().max(20).optional(),reason:z.string().max(500).optional(),lines:z.array(z.object({description:z.string().max(500),productId:z.string().max(100).default(''),category:z.enum(['','PACKAGING','CHEMICAL']),unit:z.string().max(60),packSize:z.string().max(60),quantity:z.string().max(20),unitPrice:z.string().max(20),lineNet:z.string().max(20)})).max(150)}).parse(raw);
 const review=confirm?reviewSchema.parse(raw):null;
 if(review){if(!review.netConfirmed)throw new PackagingError('Confirm that the net total and every line amount exclude VAT.');const check=reconcile(review);if(!check.balanced)throw new PackagingError(check.issues[0]);if(check.issues.length&&(!review.reconciled||review.reason.length<3))throw new PackagingError('Review the VAT/line-price warnings and record an explanation before confirming.');}
 return prisma.$transaction(async tx=>{await lock(tx,actor.restaurantId);const invoice=await tx.packagingInvoice.findFirstOrThrow({where:{id,restaurantId:actor.restaurantId},include:{document:{select:{sha256:true}}}});
 if(invoice.status!=='REVIEW'){if(confirm&&invoice.status==='CONFIRMED')return;throw new PackagingError('Only unconfirmed invoices can be edited.');}if(invoice.version!==version)throw new PackagingError('This review changed on another device. Reload before saving.');
 if(!review){await tx.packagingInvoice.update({where:{id},data:{review:json(draft),version:{increment:1}}});await audit(tx,actor,'PACKAGING_REVIEW_SAVED',id,null,{version:version+1});return;}
 const numberKey=review.invoiceNumber?invoiceNumberKey(review.invoiceNumber):null;
 if(numberKey&&await tx.packagingInvoice.findFirst({where:{supplierId:invoice.supplierId,numberKey,id:{not:id}}}))throw new PackagingError('This supplier and invoice number already exist. Open the original invoice instead.');
 const possible=await tx.packagingInvoice.findFirst({where:{restaurantId:actor.restaurantId,supplierId:invoice.supplierId,status:'CONFIRMED',id:{not:id},OR:[{deliveryDate:invoice.deliveryDate,netPence:parsePounds(review.net)},...(invoice.document?[{document:{is:{sha256:invoice.document.sha256}}}]:[])]}});
 if(possible&&(!review.duplicateReviewed||review.reason.length<3))throw new PackagingError('Possible duplicate: same supplier/date/net total or identical file. Check existing invoices, acknowledge the duplicate warning and explain why this is a separate invoice.');
 const lines=[];
 for(let i=0;i<review.lines.length;i++){const l=review.lines[i];const unit=keyOf(l.unit),packSize=keyOf(l.packSize);let product;
 const alias=!l.productId?await tx.packagingAlias.findUnique({where:{supplierId_descriptionKey_unit_packSize:{supplierId:invoice.supplierId,descriptionKey:keyOf(l.description),unit,packSize}},include:{product:true}}):null;
 if(alias&&alias.product.active&&alias.product.category===l.category)l.productId=alias.productId;
 if(l.productId){product=await tx.packagingProduct.findFirstOrThrow({where:{id:l.productId,restaurantId:actor.restaurantId,active:true}});if(product.unit!==unit||product.packSize!==packSize||product.category!==l.category)throw new PackagingError(`Line ${i+1}: product category, unit and pack size must match. Do not combine unlike packs.`);}
 else{product=await tx.packagingProduct.upsert({where:{restaurantId_nameKey_unit_packSize_category:{restaurantId:actor.restaurantId,nameKey:keyOf(l.description),unit,packSize,category:l.category}},create:{restaurantId:actor.restaurantId,name:l.description,nameKey:keyOf(l.description),unit,packSize,category:l.category},update:{}});if(!product.active)throw new PackagingError('This product is inactive. Ask a Super User to review the catalogue.');}
 lines.push({productId:product.id,originalDescription:l.description,category:l.category,unit,packSize,quantity:l.quantity||null,unitPrice:l.unitPrice||null,netPence:parsePounds(l.lineNet),position:i});
 }
 await tx.packagingInvoice.update({where:{id},data:{status:'CONFIRMED',confirmedAt:new Date(),invoiceNumber:review.invoiceNumber||null,numberKey,invoiceDate:review.invoiceDate?dateValue(review.invoiceDate):null,netPence:parsePounds(review.net),vatPence:review.vat?parsePounds(review.vat):null,grossPence:review.gross?parsePounds(review.gross):null,review:json(review),reviewReason:review.reason,version:{increment:1},lines:{create:lines}}});
 await audit(tx,actor,'PACKAGING_INVOICE_CONFIRMED',id,{status:'REVIEW'},{netPence:parsePounds(review.net),invoiceNumber:review.invoiceNumber,lines},review.reason);
 });
}
export async function catalogueOperation(prisma:PrismaClient,actor:SalesActor,operation:string,raw:Record<string,unknown>){
 admin(actor);
 return prisma.$transaction(async tx=>{await lock(tx,actor.restaurantId);
 if(operation==='void'){const v=z.object({id:str,reason:z.string().trim().min(3).max(500)}).parse(raw);const row=await tx.packagingInvoice.findFirstOrThrow({where:{id:v.id,restaurantId:actor.restaurantId,status:'CONFIRMED'}});await tx.packagingInvoice.update({where:{id:row.id},data:{status:'VOIDED',version:{increment:1}}});await audit(tx,actor,'PACKAGING_INVOICE_VOIDED',row.id,{status:row.status},{status:'VOIDED'},v.reason);return;}
 if(operation==='product'){const v=z.object({name:str,category:z.enum(['PACKAGING','CHEMICAL']),unit:z.string().trim().max(60),packSize:z.string().trim().max(60)}).parse(raw);const row=await tx.packagingProduct.upsert({where:{restaurantId_nameKey_unit_packSize_category:{restaurantId:actor.restaurantId,nameKey:keyOf(v.name),unit:keyOf(v.unit),packSize:keyOf(v.packSize),category:v.category}},create:{...v,restaurantId:actor.restaurantId,nameKey:keyOf(v.name),unit:keyOf(v.unit),packSize:keyOf(v.packSize),verified:true},update:{verified:true}});await audit(tx,actor,'PACKAGING_PRODUCT_CREATED',row.id,null,v);return;}
 if(operation==='alias'){const v=z.object({supplierId:str,productId:str,description:str,unit:z.string().max(60),packSize:z.string().max(60)}).parse(raw);const product=await tx.packagingProduct.findFirstOrThrow({where:{id:v.productId,restaurantId:actor.restaurantId,active:true}});await tx.supplier.findFirstOrThrow({where:{id:v.supplierId,restaurantId:actor.restaurantId,packagingWorkspace:true}});if(product.unit!==keyOf(v.unit)||product.packSize!==keyOf(v.packSize))throw new PackagingError('Alias units and pack size must exactly match the standard product.');
 const alias=await tx.packagingAlias.create({data:{supplierId:v.supplierId,productId:product.id,description:v.description,descriptionKey:keyOf(v.description),unit:product.unit,packSize:product.packSize}});
 const candidates=await tx.packagingLine.findMany({where:{invoice:{restaurantId:actor.restaurantId,supplierId:v.supplierId},unit:product.unit,packSize:product.packSize,category:product.category}});const matching=candidates.filter(l=>keyOf(l.originalDescription)===keyOf(v.description));
 if(matching.length)await tx.packagingLine.updateMany({where:{id:{in:matching.map(l=>l.id)}},data:{productId:product.id}});
 await audit(tx,actor,'PACKAGING_ALIAS_LINKED',alias.id,{lines:matching.map(l=>({id:l.id,productId:l.productId}))},{...v,lines:matching.map(l=>l.id)});return;}
 throw new PackagingError('Unknown catalogue action.');});
}
