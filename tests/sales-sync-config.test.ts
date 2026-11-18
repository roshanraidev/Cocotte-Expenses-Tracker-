import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {dailySyncRange,recentWindow} from '@/lib/zonal/sync-config';
import {assertDailyKind,dateRange,enqueueSalesJob} from '@/lib/sales-sync/jobs';
import type {PrismaClient} from '@/generated/prisma/client';

describe('daily sales without historical backfill',()=>{
 it('starts with recent completed dates without historical discovery',()=>{
  expect(dailySyncRange('2026-11-17',null)).toEqual({from:'2026-11-11',to:'2026-11-17'});
 });
 it('catches missing dates in batches of at most 31, rather than all history',()=>{
  const range=dailySyncRange('2026-11-17','2026-09-01');
  expect(range).toEqual({from:'2026-09-02',to:'2026-10-02'});
  expect(dateRange(range.from,range.to)).toHaveLength(31);
 });
 it('rechecks recent dates even when yesterday is already processed',()=>{
  expect(dailySyncRange('2026-11-17','2026-11-17')).toEqual({from:'2026-11-11',to:'2026-11-17'});
 });
 it('rejects historical kinds before any database access',async()=>{
  expect(()=>assertDailyKind('HISTORY')).toThrow('disabled');
  await expect(enqueueSalesJob({} as PrismaClient,{id:'one',restaurantId:'one',role:'SUPER_USER'},'HISTORY')).rejects.toThrow('disabled');
 });
 it('bounds dates and validates the correction setting',()=>{
  expect(()=>dateRange('2022-11-19','2026-11-17')).toThrow('31');
  expect(()=>dailySyncRange('not-a-date',null)).toThrow();
  vi.stubEnv('ZONAL_SALES_RECHECK_DAYS','32');expect(recentWindow()).toBe(7);vi.unstubAllEnvs();
 });
});
