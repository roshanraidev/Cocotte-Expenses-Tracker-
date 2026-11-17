import {dateKey,weekDays,validDateKey,mondayOf} from '../dates';
import type {SalesDay} from '../sales';
import {resolveSalesSources} from './sales-source';
import {reportInput,validateReport,type Report} from './validation';
export type OverviewSale={restaurantId:string;date:Date;version:number;amountPence:bigint};
export type OverviewImport={id:string;restaurantId:string;date:Date;status:string;source:string;completedAt:Date|null;salesVersion:number;branch:string;payload:unknown};
export function weeklySalesOverview(restaurantId:string,monday:string,sales:OverviewSale[],imports:OverviewImport[],forecast:SalesDay[],projectedPence:bigint|null){
 if(!validDateKey(monday)||mondayOf(monday)!==monday)throw new Error('Choose a Monday for the weekly sales overview.');
 const dates=weekDays(monday),actuals=new Map<string,OverviewSale>();
 for(const sale of sales){
  const date=dateKey(sale.date);
  if(sale.restaurantId!==restaurantId||!dates.includes(date))continue;
  if(actuals.has(date))throw new Error('Daily Sales ownership conflict. Review duplicate dates before reporting.');
  actuals.set(date,sale);
 }
 const eligibleImports=imports.filter(r=>r.restaurantId===restaurantId&&dates.includes(dateKey(r.date)));
 const sources=resolveSalesSources(restaurantId,[...actuals.values()],eligibleImports);
 const days=dates.map(date=>{
  const sale=actuals.get(date),source=sources.get(date),plan=forecast.find(d=>d.date===date);
  const record=source?eligibleImports.find(r=>r.id===source.importId):undefined;
  let report:Report|null=null;
  if(sale&&record)try{
   const parsed=validateReport(reportInput(record.payload as Report),record.branch,date);
   if(BigInt(parsed.net)===sale.amountPence)report=parsed;
  }catch{/* Broken/stale/missing detail never changes canonical sales or becomes zero. */}
  return {date,actual:sale?.amountPence??null,originalForecast:plan?.originalPence??null,revisedForecast:plan?.forecastPence??null,variance:sale&&plan?sale.amountPence-plan.originalPence:null,report,source:source??null};
 });
 const recorded=days.filter(day=>day.actual!==null),recordedDays=recorded.length;
 const actualNet=recorded.reduce((sum,day)=>sum+day.actual!,0n);
 const detailedDays=recorded.filter(day=>day.report!==null).length;
 const detailComplete=recordedDays>0&&detailedDays===recordedDays;
 const sumMoney=(key:'gross'|'discount'|'vat'|'food'|'drink'|'specials')=>detailComplete?recorded.reduce((sum,day)=>sum+BigInt(day.report![key]),0n):null;
 const sumCount=(key:'covers'|'transactions')=>detailComplete&&recorded.every(day=>day.report![key]!==null)?recorded.reduce((sum,day)=>sum+BigInt(day.report![key]!),0n):null;
 const food=sumMoney('food'),drink=sumMoney('drink'),specials=sumMoney('specials'),covers=sumCount('covers'),transactions=sumCount('transactions');
 const comparable=recordedDays>0&&recorded.every(day=>day.originalForecast!==null);
 const forecastForRecorded=comparable?recorded.reduce((sum,day)=>sum+day.originalForecast!,0n):null;
 const variance=forecastForRecorded===null?null:actualNet-forecastForRecorded;
 const varianceBps=variance!==null&&forecastForRecorded!==null&&forecastForRecorded>0n?variance*10000n/forecastForRecorded:null;
 const latestApprovedAt=[...sources.values()].reduce<Date|null>((latest,source)=>!latest||source.approvedAt>latest?source.approvedAt:latest,null);
 const originalWeekly=forecast.length===7&&dates.every(date=>forecast.some(d=>d.date===date))?forecast.reduce((sum,day)=>sum+day.originalPence,0n):null;
 return {monday,weekEnd:dates[6],days,sources,recordedDays,detailedDays,detailComplete,weekComplete:recordedDays===7,actualNet,food,drink,specials,gross:sumMoney('gross'),discount:sumMoney('discount'),vat:sumMoney('vat'),covers,transactions,averageNetPerCover:covers!==null&&covers>0n?(actualNet+covers/2n)/covers:null,forecastForRecorded,variance,varianceBps,originalWeekly,projectedPence,latestApprovedAt,roundingDifference:food!==null&&drink!==null&&specials!==null?actualNet-food-drink-specials:null};
}
export type WeeklySalesOverview=ReturnType<typeof weeklySalesOverview>;
