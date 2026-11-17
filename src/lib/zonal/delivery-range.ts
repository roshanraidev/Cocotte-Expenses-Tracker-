import {addDays,mondayOf,validDateKey} from '../dates';
export function deliverySyncRange(from:string,to:string,today:string){
 if(!validDateKey(from)||!validDateKey(to))throw new Error('Choose valid From and To dates.');
 if(from>to)throw new Error('From must be on or before To.');
 if(to>today)throw new Error('Future delivery dates cannot be synchronised.');
 if(to>addDays(from,30))throw new Error('Choose at most 31 days per request.');
 return {from,to};
}

// The selected purchasing week remains Monday–Sunday; never request future deliveries.
export function deliveryPreviewRange(from:string,to:string,today:string){
 if(validDateKey(from)&&validDateKey(to)&&from===mondayOf(from)&&to===addDays(from,6)){
  if(from>today)throw new Error('The selected week has not started. Choose this week or a previous week.');
  return deliverySyncRange(from,to>today?today:to,today);
 }
 return deliverySyncRange(from,to,today);
}
