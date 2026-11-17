import {describe,it,expect} from 'vitest';
import {salesIdentity} from '@/lib/zonal/sales-identity';
describe('one official restaurant/date sales identity',()=>{
 it('classifies an absent official day as New',()=>expect(salesIdentity('10000','hash',null)).toBe('NEW'));
 it('classifies repeated imported figures as Already Imported',()=>expect(salesIdentity('10000','hash',{amountPence:10000n,version:2},{fingerprint:'hash',salesVersion:1})).toBe('ALREADY_IMPORTED'));
 it('skips matching manually recorded net without inventing department provenance',()=>expect(salesIdentity('10000','hash',{amountPence:10000n,version:1},null)).toBe('ALREADY_IMPORTED'));
 it('requires correction for a differing official net even if a stale import fingerprint matches',()=>expect(salesIdentity('10000','hash',{amountPence:9000n,version:3},{fingerprint:'hash',salesVersion:1})).toBe('CORRECTION_REQUIRED'));
 it('requires correction for department/count changes even when net is unchanged',()=>expect(salesIdentity('10000','new-details',{amountPence:10000n,version:2},{fingerprint:'old-details',salesVersion:1})).toBe('CORRECTION_REQUIRED'));
 it('does not treat stale report details as the provenance of a later manual revision',()=>expect(salesIdentity('10000','new-details',{amountPence:10000n,version:4},{fingerprint:'old-details',salesVersion:1})).toBe('ALREADY_IMPORTED'));
 it('treats zero as an actual amount, not missing sales',()=>{expect(salesIdentity('0','hash',{amountPence:0n,version:1})).toBe('ALREADY_IMPORTED');expect(salesIdentity('0','hash',null)).toBe('NEW');});
});
