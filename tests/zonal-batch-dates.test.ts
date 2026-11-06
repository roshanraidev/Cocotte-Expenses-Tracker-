import { describe,it,expect } from 'vitest';
import { syncDates,previousWeek } from '@/lib/zonal/batch-dates';
describe('completed-day Zonal batch ranges',()=>{
 it('uses Monday through yesterday in London',()=>expect(syncDates('current','','',new Date('2026-11-06T12:00:00Z')).dates).toEqual(['2026-11-02','2026-11-03','2026-11-04','2026-11-05']));
 it('explains an empty current week on Monday',()=>{const result=syncDates('current','','',new Date('2026-11-02T12:00:00Z'));expect(result.dates).toEqual([]);expect(result.message).toContain('Monday');});
 it('handles London midnight before UTC midnight during British summer time',()=>{expect(syncDates('current','','',new Date('2026-07-05T23:15:00Z')).dates).toEqual([]);});
 it('handles the autumn clock change without duplicate or skipped dates',()=>expect(syncDates('custom','2026-10-24','2026-10-26',new Date('2026-11-06')).dates).toEqual(['2026-10-24','2026-10-25','2026-10-26']));
 it('provides the full previous Monday–Sunday week',()=>expect(previousWeek(new Date('2026-11-06T12:00:00Z'))).toEqual({from:'2026-10-26',to:'2026-11-01'}));
 it.each([['custom','2026-02-30','2026-03-01'],['custom','2026-11-04','2026-11-03'],['custom','2026-11-01','2026-11-06'],['custom','2026-11-07','2026-11-08'],['custom','2026-09-01','2026-10-02'],['invalid','','']])('rejects invalid/incomplete/future/oversized ranges %s %s %s',(mode,from,to)=>expect(()=>syncDates(mode,from,to,new Date('2026-11-06T12:00:00Z'))).toThrow());
 it('accepts exactly 31 days',()=>expect(syncDates('custom','2026-10-01','2026-10-31',new Date('2026-11-06')).dates).toHaveLength(31));
});
