import {addDays,dateKey,dateValue,londonToday,mondayOf,validDateKey} from '../dates';
import {decimal4} from '../finance';
import {decimalLabel} from './values';
export type Filters={period:string;start:string;end:string;category:string;supplier:string;product:string};
export function reportFilters(query:Record<string,string|undefined>,today=londonToday()):Filters{
 const period=['week','month','custom','undated'].includes(query.period??'')?query.period!:'week';
 let start=mondayOf(today),end=addDays(start,6);
 if(period==='week'&&query.week){if(!validDateKey(query.week))throw new Error('Choose a valid week.');start=mondayOf(query.week);end=addDays(start,6);}
 if(period==='month'){const month=query.month||today.slice(0,7);if(!/^\d{4}-\d{2}$/.test(month)||!validDateKey(month+'-01'))throw new Error('Choose a valid month.');start=month+'-01';const next=dateValue(start);next.setUTCMonth(next.getUTCMonth()+1);end=addDays(dateKey(next),-1);}
 if(period==='custom'){start=query.start||start;end=query.end||end;if(!validDateKey(start)||!validDateKey(end)||start>end)throw new Error('Enter a valid start and end date.');}
 return {period,start,end,category:['PACKAGING','CHEMICAL','UNCLASSIFIED'].includes(query.category??'')?query.category!:'',supplier:query.supplier||'',product:query.product||''};
}
export type SpendingLine={id:string;productId:string;productName:string;category:string;unit:string;packSize:string;quantity:string|null;unitPrice:string|null;netPence:bigint;invoiceId:string;invoiceNumber:string|null;orderDate:string;deliveryDate:string;supplierId:string;supplierName:string;position:number;createdAt:string;originalDescription:string;orderNumber?:string|null;priceBasis?:string};
export function summarize(lines:SpendingLine[]){
 const grouped=new Map<string,SpendingLine[]>();const suppliers=new Map<string,{id:string;name:string;net:bigint;invoices:Set<string>}>();let packaging=0n,chemical=0n,unclassified=0n;
 for(const l of lines){const group=grouped.get(l.productId)||[];group.push(l);grouped.set(l.productId,group);const s=suppliers.get(l.supplierId)||{id:l.supplierId,name:l.supplierName,net:0n,invoices:new Set<string>()};s.net+=l.netPence;s.invoices.add(l.invoiceId);suppliers.set(l.supplierId,s);if(l.category==='CHEMICAL')chemical+=l.netPence;else if(l.category==='PACKAGING')packaging+=l.netPence;else unclassified+=l.netPence;}
 const products=[...grouped].map(([id,group])=>{
  group.sort((a,b)=>a.orderDate.localeCompare(b.orderDate)||a.createdAt.localeCompare(b.createdAt)||a.invoiceId.localeCompare(b.invoiceId)||a.position-b.position);
  const first=group[0],last=group.at(-1)!;const comparable=group.every(l=>l.unit===first.unit&&l.packSize===first.packSize&&l.quantity!==null);
  const quantity=comparable?group.reduce((s,l)=>s+decimal4(l.quantity!),0n):null;const net=group.reduce((s,l)=>s+l.netPence,0n);
  const average=first.unit&&quantity&&quantity>0n?(net*1000000n+quantity/2n)/quantity:null;
  const comparablePrices=comparable&&!!first.unit&&group.every(l=>l.unitPrice!==null&&!!l.orderDate);
  const latest=comparablePrices?decimal4(last.unitPrice!):null,earliest=comparablePrices?decimal4(first.unitPrice!):null;
  return {id,name:first.productName,category:first.category,unit:first.unit,packSize:first.packSize,net,invoiceCount:new Set(group.map(l=>l.invoiceId)).size,orderDates:new Set(group.map(l=>l.orderDate).filter(Boolean)).size,quantity,average,latest,change:latest!==null&&earliest!==null?latest-earliest:null,suppliers:[...new Set(group.map(l=>l.supplierName))],history:group};
 }).sort((a,b)=>a.net===b.net?a.name.localeCompare(b.name):a.net>b.net?-1:1);
 return {total:packaging+chemical+unclassified,packaging,chemical,unclassified,invoiceCount:new Set(lines.map(l=>l.invoiceId)).size,products,suppliers:[...suppliers.values()].map(s=>({...s,invoiceCount:s.invoices.size})).sort((a,b)=>a.net>b.net?-1:a.net<b.net?1:0)};
}
export function unitPriceLabel(value:bigint|null){if(value===null)return '—';return `${value<0n?'−':''}£${decimalLabel(value<0n?-value:value)}`;}
