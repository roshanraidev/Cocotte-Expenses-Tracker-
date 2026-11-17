import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {historicalAnalytics,isoPeriod,type Day,type Selection} from '@/lib/sales-history/analytics';
import {availableReportDates} from '@/lib/zonal/report-dates.mjs';
import {historicalDays} from '@/lib/sales-history/data';
import type {PrismaClient} from '@/generated/prisma/client';
const day=(date:string,net='10000',food:string|null='7000'):Day=>({date,net,food,drink:'2000',specials:'1000',gross:'12000',vat:'2000'});
const selection:Selection={mode:'trend',granularity:'daily',metric:'net',from:'2026-01-01',to:'2026-01-03',yearA:2025,yearB:2026};
describe('canonical historical sales intelligence',()=>{
 it('preserves gaps, explicit zero, and excludes incomplete today',()=>{const r=historicalAnalytics([day('2026-01-01'),day('2026-01-03','0'),day('2026-01-04')],{...selection,to:'2026-01-04'},'2026-01-03');expect(r.points.map(p=>p.a)).toEqual(['10000',null,'0']);expect(r.totalA).toBe('10000');expect(r.matchedDays).toBe(2);expect(r.expectedDays).toBe(3);});
 it('rejects duplicate canonical dates rather than double-counting',()=>expect(()=>historicalAnalytics([day('2026-01-01'),day('2026-01-01')],selection,'2026-01-03')).toThrow('Duplicate'));
 it.each(['weekly','monthly','quarterly','yearly'] as const)('sums exact pence at %s granularity',granularity=>{const r=historicalAnalytics([day('2026-01-01','900719925474099'),day('2026-01-02','1')],{...selection,granularity},'2026-01-03');expect(r.totalA).toBe('900719925474100');expect(r.points[0].a).toBe(r.totalA);});
 it('uses disjoint verified food/drink/specials, never includes specials in food twice',()=>{const record=day('2026-01-01');const values=(['food','drink','specials'] as const).map(metric=>BigInt(historicalAnalytics([record],{...selection,metric},'2026-01-03').totalA!));expect(values.reduce((a,b)=>a+b,0n)).toBe(BigInt(record.net));});
 it('missing departmental data remains unavailable',()=>{const r=historicalAnalytics([day('2026-01-01','10000',null)],{...selection,metric:'food'},'2026-01-03');expect(r.totalA).toBeNull();expect(r.points[0].a).toBeNull();expect(r.matchedDays).toBe(0);});
 it('compares equivalent recorded calendar dates, excludes missing dates and future portions',()=>{const r=historicalAnalytics([day('2025-01-01','100'),day('2025-01-02','100'),day('2025-11-12','100'),day('2025-12-01','999'),day('2026-01-01','150'),day('2026-11-12','150')],{...selection,mode:'compare',granularity:'monthly'},'2026-11-12');expect(r.totalA).toBe('200');expect(r.totalB).toBe('300');expect(r.growthBps).toBe('5000');expect(r.difference).toBe('100');expect(r.matchedDays).toBe(2);expect(r.points.at(-1)?.period).toBe('11');expect(r.expectedDays).toBe(316);});
 it('does not divide by zero or treat absent year as zero',()=>{let r=historicalAnalytics([day('2025-01-01','0'),day('2026-01-01','100')],{...selection,mode:'compare'},'2026-01-03');expect(r.growthBps).toBeNull();r=historicalAnalytics([day('2025-01-01')],{...selection,mode:'compare'},'2026-01-03');expect(r.totalB).toBeNull();expect(r.totalA).toBeNull();});
 it('omits leap day where no equivalent calendar date exists',()=>{const r=historicalAnalytics([day('2024-02-28'),day('2024-02-29'),day('2025-02-28')],{...selection,mode:'compare',yearA:2024,yearB:2025},'2026-01-03');expect(r.matchedDays).toBe(1);expect(r.totalA).toBe('10000');});
 it('weekly comparison aligns ISO week/day across calendar boundaries',()=>{expect(isoPeriod('2025-12-29')).toEqual({year:2026,week:1,weekday:0});const r=historicalAnalytics([day('2024-12-30','100'),day('2025-12-29','150')],{...selection,mode:'compare',granularity:'weekly'},'2026-11-12');expect(r.totalA).toBe('100');expect(r.totalB).toBe('150');expect(r.points[0].period).toBe('Week 01');});
 it('moving averages require a complete contiguous window',()=>{const records=Array.from({length:7},(_,i)=>day(`2026-01-0${i+1}`));let r=historicalAnalytics(records,{...selection,to:'2026-01-07'},'2026-01-07');expect(r.points.at(-1)?.average).toBe('10000');r=historicalAnalytics(records.filter(r=>r.date!=='2026-01-03'),{...selection,to:'2026-01-07'},'2026-01-07');expect(r.points.at(-1)?.average).toBeNull();});
});
describe('observed Zonal report availability',()=>{
 it('selects only valid completed dates, ignores placeholders and future dates',()=>expect(availableReportDates(['Choose date','12 Nov 2026 (Thu)','13 Nov 2026 (Fri)','19 Nov 2022 (Sat)','31 Feb 2026 (Tue)','12 Nov 2026 (Thu)'],'2026-11-12')).toEqual(['2022-11-19','2026-11-12']));
});
describe('historical data source isolation',()=>{
 it('scopes both canonical sales and approved evidence by restaurant and uses a consistent snapshot',async()=>{
  const findMany=vi.fn().mockResolvedValue([{restaurantId:'one',date:new Date('2026-01-01'),version:1,amountPence:10000n}]);const evidence=vi.fn().mockResolvedValue([]);
  const tx={dailySales:{findMany},zonalImport:{findMany:evidence}};const transaction=vi.fn(async (fn:(client:typeof tx)=>unknown,_options:unknown)=>{void _options;return fn(tx);});
  const result=await historicalDays({$transaction:transaction} as unknown as PrismaClient,'one','2026-01-01','2026-01-03');
  expect(findMany.mock.calls[0][0].where.restaurantId).toBe('one');expect(evidence.mock.calls[0][0].where).toMatchObject({restaurantId:'one',status:'APPROVED',completedAt:{not:null}});expect(result[0]).toMatchObject({net:'10000',food:null,drink:null});expect(transaction.mock.calls[0][1]).toEqual({isolationLevel:'RepeatableRead'});
 });
});

describe('resumable bounded backfill',()=>{
 it('resumes after interruption, skips successful dates and retries failures separately',async()=>{
  const {retrievalProgress}=await import('@/lib/sales-history/backfill');
  const progress=retrievalProgress('2026-01-01','2026-01-12',[
   {date:new Date('2026-01-01'),status:'UNCHANGED',preview:null},
   {date:new Date('2026-01-02'),status:'FAILED',preview:null},
   {date:new Date('2026-01-03'),status:'NEW',preview:{status:'PREVIEW',createdAt:new Date()}},
  ]);
  expect(progress.retrieved).toBe(2);expect(progress.next).toEqual({from:'2026-01-04',to:'2026-01-10'});expect(progress.retry).toEqual({from:'2026-01-02',to:'2026-01-02'});
 });
 it('expired previews become retrievable, approved days persist, duplicates do not inflate progress',async()=>{
  const {retrievalProgress}=await import('@/lib/sales-history/backfill');
  const progress=retrievalProgress('2026-01-01','2026-01-03',[
   {date:new Date('2026-01-01'),status:'APPROVED',preview:null},
   {date:new Date('2026-01-01'),status:'UNCHANGED',preview:null},
   {date:new Date('2026-01-02'),status:'NEW',preview:{status:'PREVIEW',createdAt:new Date(Date.now()-31*60000)}},
   {date:new Date('2026-01-03'),status:'FAILED',preview:null}
  ]);
  expect(progress.retrieved).toBe(1);expect(progress.next).toEqual({from:'2026-01-02',to:'2026-01-02'});expect(progress.failed).toEqual(['2026-01-03']);
 });
});
