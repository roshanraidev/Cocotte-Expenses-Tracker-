import {addDays,dateKey,dateValue} from '../dates';
export type RetrievalDay={date:Date;status:string;preview:{status:string;createdAt:Date}|null};
export function retrievalProgress(from:string,to:string,days:RetrievalDay[],now=Date.now()){
 const total=Math.round((+dateValue(to)-+dateValue(from))/86400000)+1;
 if(total<1||total>5500)throw new Error('Historical retrieval range is invalid.');
 const dates=Array.from({length:total},(_,i)=>addDays(from,i)),completed=new Set<string>(),failed=new Set<string>();
 for(const day of days){const key=dateKey(day.date);if(key<from||key>to)continue;
  if(day.status==='UNCHANGED'||day.status==='APPROVED'||day.preview?.status==='APPROVED'||day.preview?.status==='PREVIEW'&&now-day.preview.createdAt.getTime()<25*60000)completed.add(key);
  else if(day.status==='FAILED')failed.add(key);
 }
 const failures=dates.filter(d=>failed.has(d)&&!completed.has(d));
 const remaining=dates.filter(d=>!completed.has(d)&&!failed.has(d));
 const chunk=(list:string[])=>{if(!list.length)return null;let end=list[0];for(let i=1;i<7;i++){const next=addDays(end,1);if(!list.includes(next))break;end=next;}return {from:list[0],to:end};};
 return {from,to,total,retrieved:completed.size,failed:failures,next:chunk(remaining),retry:chunk(failures)};
}
