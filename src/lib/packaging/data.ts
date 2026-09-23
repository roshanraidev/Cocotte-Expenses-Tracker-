import 'server-only';
import {db} from '../db';
import {dateKey,dateValue} from '../dates';
import {summarize,type Filters,type SpendingLine} from './reporting';
export async function packagingReport(restaurantId:string,filters:Filters){
 const invoices=await db().packagingInvoice.findMany({where:{restaurantId,status:'CONFIRMED',deliveryDate:filters.period==='undated'?null:{gte:dateValue(filters.start),lte:dateValue(filters.end)},...(filters.supplier?{supplierId:filters.supplier}:{})},include:{supplier:true,lines:{include:{product:true}}},orderBy:[{deliveryDate:'desc'},{createdAt:'desc'}]});
 const lines:SpendingLine[]=invoices.flatMap(i=>i.lines.filter(l=>(!filters.category||l.category===filters.category)&&(!filters.product||l.productId===filters.product)).map(l=>({id:l.id,productId:l.productId,productName:l.product.name,category:l.category,unit:l.unit,packSize:l.packSize,quantity:l.quantity?.toString()??null,unitPrice:l.unitPrice?.toString()??null,netPence:l.netPence,invoiceId:i.id,invoiceNumber:i.invoiceNumber,orderDate:i.orderDate?dateKey(i.orderDate):'',deliveryDate:i.deliveryDate?dateKey(i.deliveryDate):'',supplierId:i.supplierId!,supplierName:i.supplier?.name??'Unknown supplier',position:l.position,createdAt:i.createdAt.toISOString(),originalDescription:l.originalDescription,orderNumber:i.orderNumber,priceBasis:l.priceBasis})));
 return {...summarize(lines),lines,invoices};
}
