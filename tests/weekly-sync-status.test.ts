import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {weeklySyncStatus,readWeeklySyncStatus,type WeeklyBatchRecord} from '@/lib/zonal/weekly-sync-status';
import type {PrismaClient} from '@/generated/prisma/client';
const now=new Date('2026-11-18T12:00:00Z');
const day=(status='NEW',errorCode:string|null=null)=>({date:new Date('2026-11-16'),status,attempted:true,errorCode,approvalError:null,preview:errorCode?null:{status:'PREVIEW',completedAt:null}});
const batch=(changes:Partial<WeeklyBatchRecord>={}):WeeklyBatchRecord=>({id:'one',status:'COMPLETED',createdAt:now,finishedAt:now,heartbeatAt:now,days:[day()],...changes});
describe('truthful weekly sync status',()=>{
 it('does not call a fetched preview approved',()=>{expect(weeklySyncStatus(batch(),+now)).toMatchObject({stage:'Review Required',fetchCompleted:true,approved:0,review:1});});
 it('distinguishes active fetches from expired or interrupted work',()=>{
  expect(weeklySyncStatus(batch({status:'RUNNING',finishedAt:null}),+now)).toMatchObject({stage:'Sync Started',fetchCompleted:false});
  expect(weeklySyncStatus(batch({status:'RUNNING',finishedAt:null,heartbeatAt:new Date(0)}),+now)).toMatchObject({stage:'Failed',fetchCompleted:false});
 });
 it('preserves valid days and partial failures',()=>{expect(weeklySyncStatus(batch({status:'PARTIAL',days:[day(),day('FAILED','TIMEOUT')]}),+now)).toMatchObject({stage:'Review Required',partial:true,total:2,failed:1,review:1});});
 it('excludes dates after the latest offered report without inventing zero sales',()=>{
  const waiting={...day('FAILED','REPORT_AFTER_LATEST'),attempted:false,date:new Date('2026-11-17')};
  expect(weeklySyncStatus(batch({days:[day(),waiting]}),+now)).toMatchObject({total:1,unavailable:1,failed:0,latestDate:'2026-11-16'});
 });
 it('shows approval only after all available dates resolve',()=>{
  expect(weeklySyncStatus(batch({days:[{...day(),preview:{status:'APPROVED',completedAt:now}},day('UNCHANGED')]}),+now)).toMatchObject({stage:'Approved',approved:2,review:0});
 });
 it('reports full failures, and no available trading dates, honestly',()=>{
  expect(weeklySyncStatus(batch({status:'FAILED',days:[day('FAILED','TIMEOUT')]}),+now)?.stage).toBe('Failed');
  expect(weeklySyncStatus(batch({days:[{...day('FAILED','REPORT_AFTER_LATEST'),attempted:false}]}),+now)).toMatchObject({stage:'Fetch Completed',total:0,approved:0,unavailable:1});
 });
 it('scopes status to the selected week and restaurant',async()=>{
  const read=vi.fn().mockResolvedValue(null);
  await readWeeklySyncStatus({zonalSyncBatch:{findFirst:read}} as unknown as PrismaClient,{id:'admin',restaurantId:'one',role:'SUPER_USER'},'2026-11-16');
  expect(read.mock.calls[0][0].where).toEqual({restaurantId:'one',from:new Date('2026-11-16'),to:{lte:new Date('2026-11-22')}});
  await expect(readWeeklySyncStatus({} as PrismaClient,{id:'viewer',restaurantId:'one',role:'CHEF'},'2026-11-16')).rejects.toThrow();
 });
});

import {weeklyAvailability} from '@/lib/zonal/report-dates.mjs';
describe('observed selected-week availability',()=>{
 const requested=['2026-11-16','2026-11-17','2026-11-18'];
 it('clamps to the latest offered completed date, not another week',()=>{expect(weeklyAvailability(requested,['2026-11-09','2026-11-16','2026-11-17','2026-11-19'])).toEqual({latest:'2026-11-17',fetch:requested.slice(0,2),unavailable:['2026-11-18']});});
 it('does not substitute prior-week reports when the selected week is unavailable',()=>{expect(weeklyAvailability(requested,['2026-11-09'])).toEqual({latest:null,fetch:[],unavailable:requested});});
});
