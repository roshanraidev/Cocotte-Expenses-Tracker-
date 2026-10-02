import { requireUser } from '@/lib/auth';
import { addDays, dateKey, londonToday } from '@/lib/dates';
import { selectedWeek } from '@/lib/week-data';
import { financialWeek } from '@/lib/financial-data';
import { supplierReport } from '@/lib/supplier-report';
import { cumulativeSales, reportStatus } from '@/lib/reporting';
import { poundsInput } from '@/lib/money';
import { percentInput } from '@/lib/targets';
import { ratioBps, ratioLabel } from '@/lib/finance';
export async function GET(request:Request) {
 const user=await requireUser();const today=londonToday();const query=new URL(request.url).searchParams;const monday=selectedWeek(query.get('week')??undefined,today);const tab=query.get('tab')??'sales';
 const money=(v:bigint|null|undefined)=>v==null?'':poundsInput(v);
 let rows:string[][]=[];
 if(tab==='suppliers'){
  const data=await supplierReport(user.restaurantId,monday,query.get('month')??undefined,query.get('supplier')??undefined);
  rows=[['Period starting',data.start,'Period ending',addDays(data.end,-1)],['Supplier','Confirmed GBP ex VAT','Share of total','Purchase count'],...data.totals.map(s=>[s.name,money(s.amount),ratioLabel(ratioBps(s.amount,data.total)),String(s.count)]),['Total',money(data.total)],[],['Delivery date','Supplier','Order date','Confirmed GBP ex VAT'],...data.invoices.map(i=>[dateKey(i.accountingDate),i.supplier.name,i.orderDate?dateKey(i.orderDate):i.order?dateKey(i.order.orderDate):'',money(i.amountPence)])];
 }else if(tab==='history'){
  rows=[['Week starting','Original forecast GBP','Actual sales GBP','Target %','Opening GBP','Actual closing GBP','Confirmed purchases GBP','Final purchasing %','Status']];
  for(let i=0;i<12;i++){const date=addDays(monday,-7*i);const d=await financialWeek(user.restaurantId,date,today);const st=reportStatus({monday:date,today,recordedDays:d.sales?.recordedDays??0,opening:d.opening,closing:d.closing,purchasesConfirmed:d.purchasesComplete,outstandingOrders:d.orders.length});rows.push([date,money(d.sales?.originalPence),money(d.sales?.actualPence),percentInput(d.target.targetBps),money(d.opening),money(d.closing),money(d.purchases),st.status==='Final'?ratioLabel(d.finance?.actualBps??null):'',st.status==='Final'?'Final':'Provisional']);}
 }else{
  const d=await financialWeek(user.restaurantId,monday,today);
  if(tab==='purchasing'){
   const st=reportStatus({monday,today,recordedDays:d.sales?.recordedDays??0,opening:d.opening,closing:d.closing,purchasesConfirmed:d.purchasesComplete,outstandingOrders:d.orders.length});
   const cost=d.purchases;
   rows=[['Week starting',monday],['Status',st.status],['Missing information',st.missing.join('; ')],['Measure','GBP ex VAT unless percentage'],['Original forecast',money(d.sales?.originalPence)],['Actual sales',money(d.sales?.actualPence)],['Projected sales',money(d.sales?.projectedPence)],['Weekly target %',percentInput(d.target.targetBps)],['Original target %',percentInput(d.target.originalBps)],['Maximum permitted food purchases',money(d.finance?.maximum)],['Maximum purchasing budget',money(d.finance?.purchasingBudget)],['Confirmed purchases',money(d.purchases)],['Available to spend - projected',money(d.finance?.allowance)],['Food purchases - '+(st.status==='Final'?'final':'provisional'),money(cost)],['Purchasing % - '+(st.status==='Final'?'final':'provisional'),cost===null?'':ratioLabel(ratioBps(cost,d.sales?.actualPence??0n))]];
  }else rows=[['Day','Forecast GBP ex VAT','Actual GBP ex VAT','Variance GBP','Cumulative forecast GBP','Cumulative actual GBP'],...cumulativeSales(d.days).map(day=>[day.date,money(day.originalPence),money(day.actualPence),day.actualPence===null?'':money(day.actualPence-day.originalPence),money(day.cumulativeForecast),money(day.cumulativeActual)])];
 }
 // Neutralize spreadsheet formulas in user-entered names/references while retaining numeric negatives.
 const safe=(value:string)=>/^[\s]*[=+@\t\r]/.test(value)||(/^\s*-/.test(value)&&!/^-[0-9]+(?:\.[0-9]+)?$/.test(value))?`'${value}`:value;
 const csv=rows.map(row=>row.map(value=>`"${safe(value).replaceAll('"','""')}"`).join(',')).join('\r\n');
 return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="cocotte-${['sales','purchasing','suppliers','history'].includes(tab)?tab:'sales'}-${monday}.csv"`,'Cache-Control':'private, no-store'}});
}
