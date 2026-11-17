import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {foodCost,periodDates,type FoodCostPayload} from '@/lib/food-cost/calculation';
import {calculateFinance} from '@/lib/finance';
import {resultSchema} from '@/lib/zonal/worker';
const data:FoodCostPayload={from:'2026-10-26',to:'2026-11-01',category:'FOOD',currency:'GBP',opening:'50000',closing:'40000',transfersIn:'5000',transfersOut:'2000',foodSales:'500000',salesMode:'MANUAL',stockReference:'Food-only dated stocktake + transfers',salesReference:'Verified period food sales',complete:true,invoiceUniverse:'snapshot',invoices:[{id:'purchase',updatedAt:'snapshot',total:'150000',food:'120000',credit:false},{id:'credit',updatedAt:'snapshot',total:'-10000',food:'8000',credit:true}],sales:[]};
describe('actual food consumption is separate from purchasing allowance',()=>{
 it('calculates food only with credits and transfers exactly once in integer pence',()=>{
  const r=foodCost(data);expect(r).toMatchObject({complete:true,purchases:120000n,credits:8000n,consumption:125000n,bps:2500n});
 });
 it.each(['opening','closing','transfersIn','transfersOut','foodSales'] as const)('marks missing %s incomplete rather than zero',(field)=>{const r=foodCost({...data,[field]:null});expect(r.complete).toBe(false);expect(r.bps).toBeNull();expect(r.consumption).toBeNull();});
 it('accepts explicitly verified zero transfers and no invoices',()=>expect(foodCost({...data,opening:'50000',closing:'40000',transfersIn:'0',transfersOut:'0',invoices:[]}).consumption).toBe(10000n));
 it.each([{complete:false},{stockReference:''},{salesReference:''},{foodSales:'0'},{foodSales:'-1'},{currency:'USD'},{category:'DRINK'},{closing:'999999999'}])('fails safely for unverified/invalid data %j',change=>expect(foodCost({...data,...change}).bps).toBeNull());
 it('rejects duplicate allocations and food values larger than an invoice',()=>{
  expect(foodCost({...data,invoices:[data.invoices[0],data.invoices[0]]}).complete).toBe(false);
  expect(foodCost({...data,invoices:[{...data.invoices[0],food:'150001'}]}).complete).toBe(false);
 });
 it('rejects incorrectly signed credits',()=>expect(foodCost({...data,invoices:[{...data.invoices[1],credit:false}]}).complete).toBe(false));
 it('requires exact food-department coverage of every stocktake day',()=>{
  expect(foodCost({...data,salesMode:'ZONAL',sales:[]}).complete).toBe(false);
  const sales=periodDates(data.from,data.to).map(date=>({date,importId:date,fingerprint:'report',version:1,food:'10000'}));
  expect(foodCost({...data,salesMode:'ZONAL',foodSales:'70000',sales}).complete).toBe(true);
  expect(foodCost({...data,salesMode:'ZONAL',foodSales:'70000',sales:[...sales.slice(1),sales[1]]}).complete).toBe(false);
  expect(foodCost({...data,salesMode:'ZONAL',foodSales:'80000',sales}).complete).toBe(false);
 });
 it.each([['2026-11-02','2026-11-01'],['2026-02-30','2026-03-01'],['2025-01-01','2026-01-02'],['2099-01-01','2099-01-02']])('rejects invalid/incomplete periods %s %s',(from,to)=>expect(()=>periodDates(from,to,'2026-11-06')).toThrow());
 it('invalidates the percentage when evidence sources changed',()=>expect(foodCost(data,['Invoice changed']).bps).toBeNull());
 it('never changes budget, purchasing percentage or money available when stock changes',()=>{
  const original={sales:700000n,targetBps:2500,opening:50000n,expectedClosing:40000n,purchases:140000n,commitments:0n,actualClosing:40000n,actualSales:700000n,completeSales:true,purchasesConfirmed:true};
  const before=calculateFinance(original),after=calculateFinance({...original,opening:999999n,expectedClosing:1n,actualClosing:0n});
  expect(after).toEqual(before);expect(after.purchasingBudget).toBe(175000n);expect(after.allowance).toBe(35000n);expect(after.actualBps).toBe(2000n);
  expect(foodCost(data).bps).toBe(2500n); // Separate metric from the 20% purchasing percentage.
 });
});
describe('safe stock worker capability status',()=>{
 it('accepts catalogue metadata but cannot claim a verified stock extractor',()=>{
  expect(resultSchema.safeParse({code:'STOCK_UNSUPPORTED',loginVerified:true,stockDiscovery:{catalogueVerified:true,folders:['Stock'],reportNames:['Stock Result Summary.'],extractionVerified:false}}).success).toBe(true);
  expect(resultSchema.safeParse({code:'STOCK_UNSUPPORTED',stockDiscovery:{catalogueVerified:true,folders:[],reportNames:[],extractionVerified:true}}).success).toBe(false);
 });
 it('rejects cookies, tokens, password fields and arbitrary raw report payloads',()=>{
  for(const change of [{password:'secret'},{cookies:[]},{token:'secret'},{report:{opening:'100'}}])expect(resultSchema.safeParse({code:'STOCK_UNSUPPORTED',...change}).success).toBe(false);
 });
});
