import {expect,type Page} from '@playwright/test';
import {createCanvas} from '@napi-rs/canvas';
import type {PrismaClient} from '../src/generated/prisma/client';
import {invoicePdf} from './invoice-fixtures';
export async function fileFirstBrowser(admin:Page,chef:Page,prisma:PrismaClient){
 const base='http://localhost:3137';
 expect(await prisma.supplier.count({where:{packagingWorkspace:true}})).toBe(0);
 await chef.goto(base+'/packaging');await chef.getByRole('link',{name:'UPLOAD INVOICE',exact:true}).click();
 await expect(chef.getByLabel('Invoice file',{exact:true})).toBeVisible();await expect(chef.getByLabel('Invoice supplier',{exact:true})).toHaveCount(0);
 const pdf=invoicePdf(['Supplier: Unknown Cups Ltd','Invoice No: PDF-FIRST','Description Qty Unit Price ex VAT Line Total','Paper Cups 2 case 8.00 16.00','Net total: 16.00','VAT: 3.20','Gross total: 19.20']);
 await chef.getByLabel('Invoice file',{exact:true}).setInputFiles({name:'unknown.pdf',mimeType:'application/pdf',buffer:pdf});await expect(chef.getByTitle('Selected invoice PDF preview')).toBeVisible();
 await chef.getByRole('button',{name:'Upload & review invoice',exact:true}).click();await expect(chef).toHaveURL(/\/invoices\/[^/]+$/,{timeout:120000});
 const id=chef.url().split('/').at(-1)!;
 await expect(chef.getByLabel('Invoice net total (£)',{exact:true})).toHaveValue('16.00');await expect(chef.getByLabel('Supplier action',{exact:true})).toHaveCount(0);expect((await prisma.packagingInvoice.findUniqueOrThrow({where:{id}})).supplierId).toBeNull();
 await expect(chef.getByLabel('Category 1',{exact:true})).toHaveCount(0);await expect(chef.getByLabel('unitPrice 1',{exact:true})).toHaveCount(0);await chef.getByLabel('lineNet 1',{exact:true}).fill('18');await chef.getByLabel('Invoice net total (£)',{exact:true}).fill('18');
 await chef.getByRole('button',{name:'Save draft',exact:true}).click();await expect.poll(async()=> (await prisma.packagingInvoice.findUniqueOrThrow({where:{id}})).version).toBe(3);
 await chef.reload();await expect(chef.getByLabel('lineNet 1',{exact:true})).toHaveValue('18');expect(await prisma.packagingLine.count()).toBe(0);
 await admin.goto(base+`/packaging/invoices/${id}`);await admin.getByText('Supplier options',{exact:true}).click();await admin.getByLabel('Supplier action',{exact:true}).selectOption('create');await admin.getByLabel('New supplier name',{exact:true}).fill('Unknown Cups Ltd');await admin.getByText('More details · accounting and categories',{exact:true}).click();await admin.getByLabel('vat',{exact:true}).fill('3.60');await admin.getByLabel('gross',{exact:true}).fill('21.60');await admin.getByRole('button',{name:'SAVE INVOICE',exact:true}).click();await expect(admin.getByRole('heading',{name:'Confirmed net spending · £18.00',exact:true})).toBeVisible();
 await chef.reload();await expect(chef.getByRole('heading',{name:'Confirmed net spending · £18.00',exact:true})).toBeVisible();const doc=await chef.request.get(base+`/packaging/invoices/${id}/document`);expect(doc.status()).toBe(200);expect(await doc.body()).toEqual(pdf);
 await chef.goto(base+'/packaging/reports?period=undated');await expect(chef.getByRole('row').filter({hasText:'Paper Cups'})).toContainText('£18.00');
 // JPEG drag-and-drop, followed by inline enabling of an existing Food-only supplier.
 const canvas=createCanvas(1300,460),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1300,460);ctx.fillStyle='black';ctx.font='28px Arial';['Supplier: Fresh Market','Invoice No: JPG-FIRST','Net total: 8.00','VAT: 1.60','Gross total: 9.60'].forEach((s,i)=>ctx.fillText(s,25,50+i*65));const jpg=canvas.toBuffer('image/jpeg');
 await admin.goto(base+'/packaging/invoices');const transfer=await admin.evaluateHandle(data=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(data)],'photo.jpeg',{type:'image/jpeg'}));return dt;},Array.from(jpg));await admin.locator('.invoice-dropzone').dispatchEvent('drop',{dataTransfer:transfer});await transfer.dispose();await expect(admin.getByAltText('Selected invoice preview')).toBeVisible();await admin.getByRole('button',{name:'Upload & review invoice',exact:true}).click();await expect(admin).toHaveURL(/\/invoices\/[^/]+$/,{timeout:120000});
 await expect(admin.getByLabel('Invoice net total (£)',{exact:true})).toHaveValue('8.00');const jpgId=admin.url().split('/').at(-1)!;
 await admin.getByText('Supplier options',{exact:true}).click();await admin.getByLabel('Supplier action',{exact:true}).selectOption('enable');await admin.getByLabel('Food supplier to enable',{exact:true}).selectOption({label:'Fresh Market'});await admin.getByRole('button',{name:'Save draft',exact:true}).click();await expect.poll(async()=> (await prisma.supplier.findFirstOrThrow({where:{name:'Fresh Market'}})).packagingWorkspace).toBe(true);
 await chef.goto(base+`/packaging/invoices/${jpgId}`);await expect(chef.getByLabel('Invoice supplier',{exact:true})).toHaveValue((await prisma.supplier.findFirstOrThrow({where:{name:'Fresh Market'}})).id);await expect(chef.getByText('No product rows could be read.',{exact:false})).toBeVisible();
 console.log('PASS: upload PDF without suppliers, preview, Chef unknown draft, corrected prices, inline supplier creation, confirmed reports, cross-device original retrieval, JPEG drop/OCR and inline Both assignment');
}
