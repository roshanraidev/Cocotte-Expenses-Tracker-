import { addDays,londonToday,mondayOf,validDateKey } from '../dates';
import { ZonalError } from './validation';
export const MAX_SYNC_DAYS=31;
export function syncDates(mode:string,from:string,to:string,now=new Date()){
 const today=londonToday(now),yesterday=addDays(today,-1);
 if(mode==='current'){from=mondayOf(today);to=yesterday;}
 else if(mode!=='custom')throw new ZonalError('Choose Current Week or Custom Date Range.');
 if(mode==='current'&&from>to)return {from,to,dates:[],today,message:'Today is Monday. No completed days exist yet in the current Monday–Sunday week.'};
 if(!validDateKey(from)||!validDateKey(to))throw new ZonalError('Choose valid From and To dates.');
 if(from>to)throw new ZonalError('From must be on or before To.');
 if(to>=today)throw new ZonalError('Sync supports completed days only: To must be yesterday or earlier in Europe/London.');
 const dates:string[]=[];
 for(let date=from;date<=to;date=addDays(date,1)){
  dates.push(date);if(dates.length>MAX_SYNC_DAYS)throw new ZonalError('Choose at most 31 days per batch.');
 }
 return {from,to,dates,today,message:''};
}
export function previousWeek(now=new Date()){const from=addDays(mondayOf(londonToday(now)),-7);return {from,to:addDays(from,6)};}
