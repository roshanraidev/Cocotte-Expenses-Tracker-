import {describe,it,expect} from 'vitest';
import {weeklySalesOverview,type OverviewSale,type OverviewImport} from '@/lib/zonal/weekly-sales';
import {dateValue,weekDays} from '@/lib/dates';
import type {SalesDay} from '@/lib/sales';
const monday='2026-11-02',date='2026-11-03',restaurantId='restaurant';
const payload={branch:'003 – Parsons Green',date,currency:'GBP',gross:'139850',discount:'0',vat:'23058',net:'116792',food:'94583',drink:'8375',specials:'13833',covers:12,transactions:38};
const sale:OverviewSale={restaurantId,date:dateValue(date),version:1,amountPence:116792n};
const imported:OverviewImport={id:'approved',restaurantId,date:dateValue(date),status:'APPROVED',source:'ZONAL_BROWSER',completedAt:new Date('2026-11-04T10:00:00Z'),salesVersion:0,branch:payload.branch,payload};
const forecast:SalesDay[]=weekDays(monday).map(date=>({date,originalPence:100000n,forecastPence:120000n,actualPence:null}));
const build=(sales=[sale],imports=[imported],plans=forecast)=>weeklySalesOverview(restaurantId,monday,sales,imports,plans,836792n);
describe('canonical weekly sales overview',()=>{
 it('reads the verified disjoint Food/Drink/SPECIALS layout and its explicit rounding tolerance',()=>{
  const r=build();expect(r.actualNet).toBe(116792n);expect(r.food).toBe(94583n);expect(r.drink).toBe(8375n);expect(r.specials).toBe(13833n);
  expect(r.roundingDifference).toBe(1n);expect(r.gross).toBe(139850n);expect(r.vat).toBe(23058n);expect(r.discount).toBe(0n);
  expect(r.covers).toBe(12n);expect(r.transactions).toBe(38n);expect(r.averageNetPerCover).toBe(9733n);
 });
 it('never adds previews or repeated approved report rows to the official total',()=>{
  const r=build([sale],[imported,{...imported,id:'repeat'},{...imported,id:'preview',status:'PREVIEW'}]);
  expect(r.actualNet).toBe(sale.amountPence);expect(r.recordedDays).toBe(1);expect(r.food).toBe(94583n);expect(r.covers).toBe(12n);
 });
 it('compares original forecasts for exactly the recorded dates and keeps projections separate',()=>{
  const r=build();expect(r.forecastForRecorded).toBe(100000n);expect(r.variance).toBe(16792n);expect(r.varianceBps).toBe(1679n);
  expect(r.originalWeekly).toBe(700000n);expect(r.projectedPence).toBe(836792n);expect(r.weekComplete).toBe(false);
 });
 it('returns Not available data for manual/stale breakdowns while keeping canonical net',()=>{
  const manual={...sale,date:dateValue('2026-11-04'),amountPence:50000n};
  const r=build([sale,manual]);expect(r.actualNet).toBe(166792n);expect(r.detailedDays).toBe(1);expect(r.food).toBeNull();expect(r.gross).toBeNull();expect(r.covers).toBeNull();
  const stale=build([{...sale,version:2}]);expect(stale.food).toBeNull();expect(stale.actualNet).toBe(116792n);expect(stale.latestApprovedAt).toBeNull();
 });
 it('never attaches an older report after a newer nonmatching approval or manual correction',()=>{
  const newer={...imported,id:'newer',salesVersion:2,completedAt:new Date('2026-11-05T10:00:00Z')};
  expect(build([sale],[imported,newer]).food).toBeNull();
  expect(build([{...sale,amountPence:10000n}]).food).toBeNull();
 });
 it('isolates restaurant and Monday–Sunday dates, including adjacent weeks',()=>{
  const r=build([sale,{...sale,restaurantId:'foreign',amountPence:999999n},{...sale,date:dateValue('2026-11-09'),amountPence:999999n}],[imported,{...imported,restaurantId:'foreign'}]);
  expect(r.actualNet).toBe(116792n);expect(r.days.map(d=>d.date)).toEqual(weekDays(monday));expect(r.days[6].date).toBe('2026-11-08');
  expect(weeklySalesOverview('foreign',monday,[sale],[imported],[],null).actualNet).toBe(0n);
 });
 it('rejects a canonical ownership conflict instead of summing duplicate sales',()=>expect(()=>build([sale,{...sale}])).toThrow('ownership conflict'));
 it.each([{food:'108416'}, {gross:'139851'}, {date:'2026-11-04'}, {currency:'EUR'}, {food:undefined}])('marks malformed or double-counted departments unavailable %j',change=>{
  const r=build([sale],[{...imported,payload:{...payload,...change}}]);expect(r.food).toBeNull();expect(r.actualNet).toBe(sale.amountPence);
 });
 it('does not infer counts or averages from money when counts are missing or zero',()=>{
  expect(build([sale],[{...imported,payload:{...payload,covers:null}}]).averageNetPerCover).toBeNull();
  expect(build([sale],[{...imported,payload:{...payload,covers:0}}]).averageNetPerCover).toBeNull();
  const r=build([sale],[{...imported,payload:{...payload,covers:null}}]);expect(r.food).toBe(94583n);expect(r.transactions).toBe(38n);
 });
 it('shows no invented breakdown or variance with no recorded days / missing forecasts',()=>{
  const empty=build([],[],forecast);expect(empty.actualNet).toBe(0n);expect(empty.food).toBeNull();expect(empty.variance).toBeNull();
  const noPlan=build([sale],[imported],[]);expect(noPlan.actualNet).toBe(116792n);expect(noPlan.originalWeekly).toBeNull();expect(noPlan.forecastForRecorded).toBeNull();
 });
 it('does not divide by zero when the original recorded-day forecast was zero',()=>{
  const r=build([sale],[imported],forecast.map(d=>({...d,originalPence:0n})));expect(r.variance).toBe(116792n);expect(r.varianceBps).toBeNull();
 });
 it('marks seven canonical days complete and sums only the selected week once',()=>{
  const sales=weekDays(monday).map(date=>({...sale,date:dateValue(date)}));
  const imports=weekDays(monday).map(date=>({...imported,id:date,date:dateValue(date),payload:{...payload,date}}));
  const r=build(sales,imports);expect(r.weekComplete).toBe(true);expect(r.recordedDays).toBe(7);expect(r.actualNet).toBe(7n*116792n);expect(r.food).toBe(7n*94583n);
 });
});
