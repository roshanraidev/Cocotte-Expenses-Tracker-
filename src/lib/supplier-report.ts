import 'server-only';
import {db} from './db';
import {addDays,dateValue,validDateKey} from './dates';
export async function supplierReport(restaurantId:string,monday:string,month?:string,supplierId?:string) {
  const validMonth=!!month&&/^\d{4}-\d{2}$/.test(month)&&validDateKey(`${month}-01`);
  const start=validMonth?`${month}-01`:monday;
  const end=validMonth?new Date(Date.UTC(Number(month!.slice(0,4)),Number(month!.slice(5,7)),1)).toISOString().slice(0,10):addDays(monday,7);
  const where={restaurantId,...(supplierId?{supplierId}:{}),accountingDate:{gte:dateValue(start),lt:dateValue(end)},confirmedAt:{not:null},voidedAt:null};
  const invoices=await db().purchaseInvoice.findMany({where,include:{supplier:true,order:true},orderBy:{accountingDate:'asc'}});
  const orders=await db().supplierOrder.findMany({where:{restaurantId,...(supplierId?{supplierId}:{}),status:'PLACED',expectedDeliveryDate:{gte:dateValue(start),lt:dateValue(end)}},include:{supplier:true}});
  const totals=new Map<string,{id:string;name:string;amount:bigint;count:number}>();
  for(const i of invoices){const row=totals.get(i.supplierId)??{id:i.supplierId,name:i.supplier.name,amount:0n,count:0};row.amount+=i.amountPence;if(!i.creditForId)row.count++;totals.set(i.supplierId,row);}
  return {start,end,month:validMonth?month:undefined,invoices,orders,totals:[...totals.values()].sort((a,b)=>a.amount>b.amount?-1:a.amount<b.amount?1:0),total:invoices.reduce((sum,i)=>sum+i.amountPence,0n)};
}
