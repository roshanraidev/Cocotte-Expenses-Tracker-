import { dateKey } from '../dates';
export type ZonalSalesSource={importId:string;reportDate:string;approvedAt:Date;branch:string;netPence:bigint;method:string};
type Sale={restaurantId:string;date:Date;version:number;amountPence:bigint};
type Import={id:string;restaurantId:string;date:Date;status:string;source:string;completedAt:Date|null;salesVersion:number;branch:string;payload:unknown};
export function resolveSalesSources(restaurantId:string,sales:Sale[],imports:Import[]){
 const result=new Map<string,ZonalSalesSource>();
 const actuals=new Map(sales.filter(s=>s.restaurantId===restaurantId).map(s=>[dateKey(s.date),s]));
 const seen=new Set<string>();
 for(const record of [...imports].sort((a,b)=>(b.completedAt?.getTime()??0)-(a.completedAt?.getTime()??0))){
  if(record.restaurantId!==restaurantId||record.status!=='APPROVED'||!record.completedAt||!['ZONAL_BROWSER','ZONAL_MANUAL'].includes(record.source))continue;
  const date=dateKey(record.date);if(seen.has(date))continue;seen.add(date);
  const sale=actuals.get(date),net=(record.payload as {net?:unknown}|null)?.net;
  // A later manual correction invalidates the source badge, even when old amounts reappear.
  if(!sale||sale.version!==record.salesVersion+1||typeof net!=='string'||!/^\d{1,16}$/.test(net)||sale.amountPence!==BigInt(net))continue;
  result.set(date,{importId:record.id,reportDate:date,approvedAt:record.completedAt,branch:record.branch,netPence:sale.amountPence,method:record.source});
 }
 return result;
}
