import {describe,it,expect} from 'vitest';
import {cumulativeSales,reportStatus} from '../src/lib/reporting';
import {calculateFinance} from '../src/lib/finance';
const complete={monday:'2026-09-14',today:'2026-09-21',recordedDays:7,opening:10000n,closing:9000n,purchasesConfirmed:true,outstandingOrders:0};
describe('auditable weekly reports',()=>{
 it('accumulates actual sales chronologically and leaves missing days blank',()=>{
  const rows=cumulativeSales([['2026-09-16',220000n],['2026-09-14',140000n],['2026-09-15',200000n],['2026-09-17',null],['2026-09-18',0n]].map(([date,actual])=>({date:date as string,actualPence:actual as bigint|null,originalPence:100000n,forecastPence:999999n})));
  expect(rows.map(d=>d.cumulativeActual)).toEqual([140000n,340000n,560000n,null,560000n]);
  expect(rows.at(-1)?.cumulativeForecast).toBe(500000n);
 });
 it('requires the week to have ended and every source to be complete',()=>{
  expect(reportStatus(complete).status).toBe('Final');
  expect(reportStatus({...complete,today:'2026-09-20'}).status).toBe('In progress');
  for(const missing of [{recordedDays:6},{closing:null},{opening:null},{purchasesConfirmed:false},{outstandingOrders:1}])expect(reportStatus({...complete,...missing}).status).toBe('Provisional');
 });
 it('preserves manual zero opening and exposes the purchasing budget',()=>{
  const result=calculateFinance({sales:1800000n,targetBps:2400,opening:0n,expectedClosing:50000n,purchases:200000n,commitments:50000n,actualClosing:40000n,actualSales:1800000n,completeSales:true,purchasesConfirmed:true});
  expect(result.purchasingBudget).toBe(482000n);expect(result.allowance).toBe(282000n);
 });
});
