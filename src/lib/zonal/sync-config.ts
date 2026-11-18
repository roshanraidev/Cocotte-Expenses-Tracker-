import {addDays,validDateKey} from '../dates';
import {ZonalError} from './validation';

export function recentWindow(){
 const n=Number(process.env.ZONAL_SALES_RECHECK_DAYS??7);
 return Number.isInteger(n)&&n>=1&&n<=31?n:7;
}

/** First use checks recent completed days; subsequent jobs catch up in bounded chunks. */
export function dailySyncRange(yesterday:string,previousTo:string|null,recheckDays=7){
 if(!validDateKey(yesterday)||previousTo!==null&&!validDateKey(previousTo))throw new ZonalError('Invalid sales sync date.');
 const window=Number.isInteger(recheckDays)&&recheckDays>=1&&recheckDays<=31?recheckDays:7;
 const recent=addDays(yesterday,1-window);
 const next=previousTo?addDays(previousTo,1):recent;
 const from=next<recent?next:recent;
 const limit=addDays(from,30);
 return {from,to:limit<yesterday?limit:yesterday};
}
