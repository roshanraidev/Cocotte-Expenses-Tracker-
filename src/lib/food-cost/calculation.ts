import {z} from 'zod';
import {validDateKey,addDays,londonToday} from '../dates';
export class FoodCostError extends Error {}
const pence=z.string().regex(/^\d{1,18}$/);
export const foodCostPayload=z.object({
 from:z.string().refine(validDateKey),to:z.string().refine(validDateKey),category:z.literal('FOOD'),currency:z.literal('GBP'),
 opening:pence.nullable(),closing:pence.nullable(),transfersIn:pence.nullable(),transfersOut:pence.nullable(),
 foodSales:pence.nullable(),salesMode:z.enum(['ZONAL','MANUAL']),stockReference:z.string().max(300),salesReference:z.string().max(300),
 complete:z.boolean(),invoiceUniverse:z.string(),
 invoices:z.array(z.object({id:z.string(),updatedAt:z.string(),total:z.string().regex(/^-?\d{1,18}$/),food:pence,credit:z.boolean()}).strict()).max(1000),
 sales:z.array(z.object({date:z.string().refine(validDateKey),importId:z.string(),fingerprint:z.string(),version:z.number().int().positive(),food:pence}).strict()).max(366),
}).strict();
export type FoodCostPayload=z.infer<typeof foodCostPayload>;
export function periodDates(from:string,to:string,today=londonToday()){
 if(!validDateKey(from)||!validDateKey(to)||from>to||to>=today)throw new FoodCostError('Choose a completed period ending yesterday or earlier.');
 const dates:string[]=[];
 for(let date=from;date<=to;date=addDays(date,1)){dates.push(date);if(dates.length>366)throw new FoodCostError('Choose at most 366 days per stocktake period.');}
 return dates;
}
export function foodCost(input:unknown,sourceIssues:string[]=[]){
 const parsed=foodCostPayload.safeParse(input);
 if(!parsed.success)return {complete:false,issues:['Stored food cost data could not be validated.'],purchases:null,credits:null,consumption:null,bps:null};
 const p=parsed.data,issues=[...sourceIssues];
 let dates:string[]=[];
 try{dates=periodDates(p.from,p.to);}catch{issues.push('Stock, invoices and food sales require the same valid completed reporting period.');}
 if(p.salesMode==='ZONAL'){
  const saleDates=p.sales.map(s=>s.date);
  if(saleDates.length!==dates.length||new Set(saleDates).size!==dates.length||dates.some(date=>!saleDates.includes(date)))issues.push('Approved food department sales are missing, duplicated or outside the stocktake period.');
  if(p.foodSales!==null&&p.sales.reduce((sum,s)=>sum+BigInt(s.food),0n)!==BigInt(p.foodSales))issues.push('Food sales total does not match the verified daily food sales.');
 }
 for(const [field,label] of [['opening','Opening food stock'],['closing','Closing food stock'],['transfersIn','Food transfers in'],['transfersOut','Food transfers out'],['foodSales','Verified net food sales']] as const)if(p[field]===null)issues.push(label+' is missing.');
 if(!p.complete)issues.push('The stocktake period and all food purchases, credits, transfers and food sales must be explicitly verified.');
 if(p.stockReference.trim().length<3)issues.push('Add the food stocktake / movement evidence reference.');
 if(p.salesMode==='MANUAL'&&p.salesReference.trim().length<3)issues.push('Add the manual food-sales evidence reference.');
 const ids=new Set<string>();
 let purchases=0n,credits=0n;
 for(const invoice of p.invoices){
  if(ids.has(invoice.id))issues.push('An invoice allocation is duplicated.');
  ids.add(invoice.id);
  const total=BigInt(invoice.total),food=BigInt(invoice.food);
  if(food>(total<0n?-total:total)||invoice.credit!==(total<0n))issues.push('A food invoice allocation exceeds its source or has an incorrect credit classification.');
  if(invoice.credit)credits+=food;else purchases+=food;
 }
 if(p.foodSales!==null&&BigInt(p.foodSales)<=0n)issues.push('Actual net food sales must be greater than zero for a percentage.');
 let consumption:bigint|null=null,bps:bigint|null=null;
 if(!issues.length){
  consumption=BigInt(p.opening!)+purchases+BigInt(p.transfersIn!)-credits-BigInt(p.transfersOut!)-BigInt(p.closing!);
  if(consumption<0n){issues.push('Negative food consumption: verify the stock boundary, transfers and invoice classification.');consumption=null;}
  else bps=consumption*10000n/BigInt(p.foodSales!);
 }
 return {complete:issues.length===0,issues:[...new Set(issues)],purchases,credits,consumption,bps};
}
