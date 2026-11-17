import {describe,it,expect} from 'vitest';
import {deliverySyncRange,deliveryPreviewRange} from '../src/lib/zonal/delivery-range';
describe('delivery availability date range',()=>{
 it('accepts a recent inclusive 30 day period',()=>expect(deliverySyncRange('2026-10-12','2026-11-10','2026-11-10')).toEqual({from:'2026-10-12',to:'2026-11-10'}));
 it('accepts a historical 31 day period',()=>expect(deliverySyncRange('2026-01-01','2026-01-31','2026-11-10').to).toBe('2026-01-31'));
 it.each([['2026-02-30','2026-03-01'],['','2026-11-10'],['2026-11-10','2026-11-09'],['2026-11-10','2026-11-11'],['2026-01-01','2026-02-01']])('rejects invalid dates/ranges %s %s',(from,to)=>expect(()=>deliverySyncRange(from,to,'2026-11-10')).toThrow());
});

describe('selected purchasing week preview',()=>{
 it('keeps a historical Monday–Sunday inclusive across the London DST boundary',()=>expect(deliveryPreviewRange('2026-10-19','2026-10-25','2026-11-11')).toEqual({from:'2026-10-19',to:'2026-10-25'}));
 it('requests only elapsed business dates for the current selected week',()=>expect(deliveryPreviewRange('2026-11-09','2026-11-15','2026-11-11')).toEqual({from:'2026-11-09',to:'2026-11-11'}));
 it('includes Monday itself without requesting future deliveries',()=>expect(deliveryPreviewRange('2026-11-09','2026-11-15','2026-11-09').to).toBe('2026-11-09'));
 it('includes Sunday for a complete week',()=>expect(deliveryPreviewRange('2026-11-09','2026-11-15','2026-11-15').to).toBe('2026-11-15'));
 it('rejects a future week and does not relax custom future ranges',()=>{
  expect(()=>deliveryPreviewRange('2026-11-16','2026-11-22','2026-11-11')).toThrow('not started');
  expect(()=>deliveryPreviewRange('2026-11-10','2026-11-15','2026-11-11')).toThrow('Future');
 });
});
