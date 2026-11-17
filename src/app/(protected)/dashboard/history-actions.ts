'use server';
import {requirePermission} from '@/lib/auth';
import {assertPermission} from '@/lib/access';
import {db} from '@/lib/db';
import {addDays,dateKey,londonToday,validDateKey,dateValue} from '@/lib/dates';
import {z} from 'zod';
import {historicalAnalytics,metrics} from '@/lib/sales-history/analytics';
import {historicalDays} from '@/lib/sales-history/data';
const selection=z.object({mode:z.enum(['trend','compare']),granularity:z.enum(['daily','weekly','monthly','quarterly','yearly']),metric:z.enum(metrics),from:z.string().refine(validDateKey),to:z.string().refine(validDateKey),yearA:z.number().int().min(2000).max(2100),yearB:z.number().int().min(2000).max(2100)}).strict();
export async function historyMetadata(){
 const actor=await requirePermission('sales.view');assertPermission(actor,'dashboard.view');
 const records=await db().dailySales.groupBy({by:['date'],where:{restaurantId:actor.restaurantId},orderBy:{date:'asc'}});
 const dates=records.map(r=>dateKey(r.date));return {first:dates[0]??null,last:dates.at(-1)??null,years:[...new Set(dates.map(d=>Number(d.slice(0,4))))],exportAllowed:actor.permissions.includes('reports.export')};
}
export async function readSalesHistory(input:unknown){
 const actor=await requirePermission('sales.view');assertPermission(actor,'dashboard.view');const s=selection.parse(input);
 const from=s.mode==='compare'?`${Math.min(s.yearA,s.yearB)-1}-12-29`:s.from;
 const to=s.mode==='compare'?`${Math.max(s.yearA,s.yearB)+1}-01-04`:s.to;
 if(from>to||(+dateValue(to)-+dateValue(from))/86400000>5500)throw new Error('Choose a date range of at most 15 years.');
 const days=await historicalDays(db(),actor.restaurantId,from,to);
 return historicalAnalytics(days,s,addDays(londonToday(),-1));
}
export async function exportSalesHistory(input:unknown){
 const actor=await requirePermission('reports.export');assertPermission(actor,'sales.view');assertPermission(actor,'dashboard.view');
 const result=await readSalesHistory(input);const s=selection.parse(input);
 return [`Period,${s.mode==='compare'?s.yearA:'Recorded'} ${s.metric} GBP,${s.mode==='compare'?s.yearB:'Comparison'} ${s.metric} GBP,Matched recorded days,Eligible days`,...result.points.map(p=>[p.period,p.a===null?'':decimal(p.a),p.b===null?'':decimal(p.b),p.recorded,p.expected].join(','))].join('\r\n');
}
function decimal(pence:string){const n=BigInt(pence);return `${n/100n}.${(n%100n).toString().padStart(2,'0')}`;}
