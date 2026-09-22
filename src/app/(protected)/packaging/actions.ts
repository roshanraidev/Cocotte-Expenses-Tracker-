'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {Prisma} from '@/generated/prisma/client';
import {z} from 'zod';
import {registerInvoice,saveReview,catalogueOperation,PackagingError} from '@/lib/packaging/service';
import {extractDocument} from '@/lib/packaging/extract';
import {keyOf} from '@/lib/packaging/values';
import type {FormResult} from '@/lib/sales-validation';
async function scan(id:string,restaurantId:string){
 const row=await db().packagingInvoice.findFirstOrThrow({where:{id,restaurantId,status:'REVIEW'},include:{document:true}});if(!row.document)throw new PackagingError('No document attached. Enter the lines manually.');
 let data:Prisma.PackagingInvoiceUpdateManyMutationInput;
 try{const result=await extractDocument(row.document.bytes,row.document.mime);const aliases=row.supplierId?await db().packagingAlias.findMany({where:{supplierId:row.supplierId},include:{product:true}}):[];
 const review={...result.extraction,invoiceNumber:result.extraction.invoiceNumber,lines:result.extraction.lines.map(l=>{const alias=aliases.find(a=>a.descriptionKey===keyOf(l.description)&&a.unit===keyOf(l.unit)&&a.packSize===keyOf(l.packSize));return {...l,productId:alias?.productId??'',category:alias?.product.category??''};}),netConfirmed:false,reconciled:false,duplicateReviewed:false,reason:''};
 data={extractedText:result.text,extraction:result.extraction as unknown as Prisma.InputJsonValue,review:review as unknown as Prisma.InputJsonValue,scanNote:(result.text.trim()?'Text extracted; suggestions need your review. ':'No readable text was extracted. Enter the invoice manually. ')+result.extraction.warnings.join(' '),version:{increment:1}};
 }catch(e){data={scanNote:e instanceof Error?`Scan needs manual review: ${e.message.slice(0,250)}`:'Scanning failed. Enter products manually.',version:{increment:1}};}
 const updated=await db().packagingInvoice.updateMany({where:{id,restaurantId,version:row.version,status:'REVIEW'},data});if(!updated.count)throw new PackagingError('The review changed while scanning. Reload; your saved edits were preserved.');
}
export async function packagingAction(_previous:FormResult,form:FormData):Promise<FormResult>{
 const user=await requireUser();const operation=String(form.get('operation'));let go='';
 try{
  if(operation==='upload'){
   const upload=form.get('entryMode')==='manual'?null:form.get('file');
   if(form.get('entryMode')==='file'&&(!(upload instanceof File)||!upload.size))throw new PackagingError('Choose an invoice file first.');const file=upload instanceof File&&upload.size?{bytes:new Uint8Array(await upload.arrayBuffer()),filename:upload.name,mime:upload.type}:undefined;
   const row=await registerInvoice(db(),user,Object.fromEntries(form),file);go=`/packaging/invoices/${row.id}`;
   if(file&&!row.review&&!row.extractedText)await scan(row.id,user.restaurantId);
  }else if(operation==='scan'){await scan(String(form.get('id')),user.restaurantId);}
  else if(operation==='review'||operation==='confirm'){await saveReview(db(),user,String(form.get('id')),Number(form.get('version')),JSON.parse(String(form.get('review'))),operation==='confirm');}
  else await catalogueOperation(db(),user,operation,Object.fromEntries(form));
 }catch(e){if(e instanceof PackagingError||e instanceof z.ZodError)return {error:e instanceof z.ZodError?e.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '):e.message,success:''};if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2002','P2025'].includes(e.code))return {error:'This record already exists or is unavailable. Reload and check supplier, invoice number and product links.',success:''};if(e instanceof SyntaxError)return {error:'Invalid review data. Reload and try again.',success:''};if(operation==='upload'&&e instanceof Error)return {error:'The upload could not be saved. Try again or contact your administrator. No invoice has been confirmed.',success:''};throw e;}
 for(const p of ['/packaging','/packaging/invoices','/packaging/products','/packaging/reports','/packaging/suppliers','/suppliers','/orders'])revalidatePath(p,'page');
 if(form.get('id'))revalidatePath(`/packaging/invoices/${String(form.get('id'))}`);
 if(go)redirect(go);
 return {error:'',success:operation==='confirm'?'Invoice confirmed. Net spending is now included.':'Saved successfully.'};
}
