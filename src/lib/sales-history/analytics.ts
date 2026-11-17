import {addDays,dateValue,mondayOf,validDateKey} from '../dates';
export const metrics=['net','food','drink','specials','gross','vat'] as const;
export type Metric=typeof metrics[number];
export type Granularity='daily'|'weekly'|'monthly'|'quarterly'|'yearly';
export type Day={date:string;net:string;food:string|null;drink:string|null;specials:string|null;gross:string|null;vat:string|null};
export type Selection={mode:'trend'|'compare';granularity:Granularity;metric:Metric;from:string;to:string;yearA:number;yearB:number};
export type Point={period:string;a:string|null;b:string|null;average:string|null;recorded:number;expected:number};
function quotient(numerator:bigint,denominator:bigint){return denominator===0n?null:(numerator/denominator).toString();}
function bucket(date:string,g:Granularity){
 if(g==='daily')return date;if(g==='weekly')return mondayOf(date);
 if(g==='monthly')return date.slice(0,7);if(g==='quarterly')return `${date.slice(0,4)} Q${Math.ceil(Number(date.slice(5,7))/3)}`;return date.slice(0,4);
}
// A week comparison is explicitly ISO week + weekday, including ISO year boundaries.
export function isoPeriod(date:string){const d=dateValue(date);const weekday=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()+3-weekday);const year=d.getUTCFullYear();const first=mondayOf(`${year}-01-04`);return {year,week:Math.floor((+dateValue(date)-+dateValue(first))/604800000)+1,weekday};}
function comparableKey(date:string,g:Granularity){const iso=isoPeriod(date);return g==='weekly'?`${String(iso.week).padStart(2,'0')}-${iso.weekday}`:date.slice(5);}
function comparisonBucket(key:string,g:Granularity){if(g==='weekly')return `Week ${key.slice(0,2)}`;if(g==='daily')return key;if(g==='monthly')return key.slice(0,2);if(g==='quarterly')return `Q${Math.ceil(Number(key.slice(0,2))/3)}`;return 'Comparable year';}
export function historicalAnalytics(input:Day[],s:Selection,yesterday:string){
 if(!validDateKey(s.from)||!validDateKey(s.to)||s.from>s.to)throw new Error('Choose a valid date range.');
 const unique=new Map<string,Day>();for(const day of input){if(unique.has(day.date))throw new Error('Duplicate canonical sales date.');unique.set(day.date,day);}
 const points=new Map<string,Point>();let a=0n,b=0n,matched=0,expected=0;
 const point=(key:string)=>{let p=points.get(key);if(!p){p={period:key,a:null,b:null,average:null,recorded:0,expected:0};points.set(key,p);}return p;};
 const sum=(p:Point,key:'a'|'b',value:string)=>p[key]=(BigInt(p[key]??'0')+BigInt(value)).toString();
 if(s.mode==='trend'){
  const end=s.to<yesterday?s.to:yesterday;
  if((+dateValue(end)-+dateValue(s.from))/86400000>5500)throw new Error('Choose a range of at most 15 years.');
  for(let date=s.from;date<=end;date=addDays(date,1)){const p=point(bucket(date,s.granularity));p.expected++;expected++;const value=unique.get(date)?.[s.metric];if(value!==undefined&&value!==null){sum(p,'a',value);p.recorded++;matched++;a+=BigInt(value);}}
 }else{
  if(s.yearA===s.yearB)throw new Error('Choose two different available years.');
  const maps=[s.yearA,s.yearB].map(year=>{
   const map=new Map<string,Day>();for(const day of unique.values())if(day.date<=yesterday&&(s.granularity==='weekly'?isoPeriod(day.date).year:Number(day.date.slice(0,4)))===year)map.set(comparableKey(day.date,s.granularity),day);return map;
  });
  // Cap both years at the last actual record in the less complete year. Never pad absent dates with zero.
  const last=maps.map(map=>[...map.keys()].sort().at(-1));const cutoff=last.every(Boolean)?last.sort()[0]!:'';
  const calendars=[s.yearA,s.yearB].map(year=>{const map=new Map<string,string>();for(let date=`${year-1}-12-29`;date<=`${year+1}-01-04`;date=addDays(date,1))if((s.granularity==='weekly'?isoPeriod(date).year:Number(date.slice(0,4)))===year)map.set(comparableKey(date,s.granularity),date);return map;});
  for(const key of [...calendars[0].keys()].sort()){
   if(key>cutoff||!calendars[1].has(key))continue;
   const p=point(comparisonBucket(key,s.granularity));p.expected++;expected++;
   const av=maps[0].get(key)?.[s.metric],bv=maps[1].get(key)?.[s.metric];
   if(av==null||bv==null)continue;sum(p,'a',av);sum(p,'b',bv);p.recorded++;matched++;a+=BigInt(av);b+=BigInt(bv);
  }
 }
 const rows=[...points.values()].sort((x,y)=>x.period.localeCompare(y.period));
 const window=s.granularity==='daily'?7:s.granularity==='weekly'?4:s.granularity==='monthly'?3:0;
 if(s.mode==='trend'&&window)for(let i=window-1;i<rows.length;i++){const group=rows.slice(i-window+1,i+1);if(group.every(p=>p.a!==null&&p.recorded===p.expected))rows[i].average=quotient(group.reduce((sum,p)=>sum+BigInt(p.a!),0n),BigInt(window));}
 return {points:rows,totalA:matched?a.toString():null,totalB:s.mode==='compare'&&matched?b.toString():null,difference:s.mode==='compare'&&matched?(b-a).toString():null,growthBps:s.mode==='compare'&&matched&&a>0n?quotient((b-a)*10000n,a):null,matchedDays:matched,expectedDays:expected,window,coverage:s.mode==='compare'?'Only matching recorded dates contribute to both years. Weekly comparisons use ISO week and weekday; other comparisons use calendar month/day.':'Recorded sales only. Gaps are missing records, not zero sales.'};
}
