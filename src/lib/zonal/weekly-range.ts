import {addDays,mondayOf,validDateKey} from '../dates';
import {syncDates} from './batch-dates';
import {ZonalError} from './validation';
/** Selected Dashboard business week; keep the original completed-day import rule. */
export function weeklySyncRange(monday:string,today:string){
 if(!validDateKey(monday)||mondayOf(monday)!==monday||!validDateKey(today))throw new ZonalError('Choose a valid Monday–Sunday Dashboard week.');
 const sunday=addDays(monday,6),yesterday=addDays(today,-1),to=sunday<yesterday?sunday:yesterday;
 if(to<monday)return {monday,sunday,from:monday,to,dates:[] as string[],message:'No completed reporting days are available in the selected week yet.'};
 const range=syncDates('custom',monday,to,new Date(today+'T12:00:00Z'));
 return {...range,monday,sunday};
}

/** Only selected-week dates plus a bounded recent correction window, never an intervening backfill. */
export function weeklySyncDates(monday:string,today:string,recheckDays=7){
 const selected=weeklySyncRange(monday,today);if(!selected.dates.length)return {...selected,correctionDates:[] as string[]};
 const window=Number.isInteger(recheckDays)&&recheckDays>=1&&recheckDays<=31?recheckDays:7;
 const selectedSet=new Set(selected.dates),extra:string[]=[];
 for(let i=1;i<=window;i++){const date=addDays(today,-i);if(!selectedSet.has(date))extra.push(date);}
 const correctionDates=extra.slice(0,31-selected.dates.length).sort();
 return {...selected,dates:[...selected.dates,...correctionDates].sort(),correctionDates};
}
