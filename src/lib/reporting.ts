import { addDays } from './dates';
import type { SalesDay } from './sales';
export function cumulativeSales(days: SalesDay[]) {
  let forecast=0n; let actual=0n;
  return [...days].sort((a,b)=>a.date.localeCompare(b.date)).map(day=>{
    forecast+=day.originalPence;
    if(day.actualPence!==null) actual+=day.actualPence;
    return {...day,cumulativeForecast:forecast,cumulativeActual:day.actualPence===null?null:actual};
  });
}
export function reportStatus(input:{monday:string;today:string;recordedDays:number;opening:bigint|null;closing:bigint|null;purchasesConfirmed:boolean;outstandingOrders:number}) {
  const missing:string[]=[];
  if(addDays(input.monday,6)>=input.today) missing.push('The Monday–Sunday accounting week has not ended');
  if(input.recordedDays!==7) missing.push(`${7-input.recordedDays} daily sales entries missing`);
  if(input.opening===null) missing.push('Opening stock is missing');
  if(input.closing===null) missing.push('Actual Sunday closing stock is missing');
  if(!input.purchasesConfirmed) missing.push('Historical purchases still require reconciliation');
  if(input.outstandingOrders) missing.push(`${input.outstandingOrders} supplier orders still outstanding`);
  return {status:missing.length?(addDays(input.monday,6)>=input.today?'In progress':'Provisional'):'Final',missing};
}
