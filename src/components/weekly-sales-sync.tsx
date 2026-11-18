'use client';
import {useEffect,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {RefreshCw} from 'lucide-react';
import {weeklySyncRange} from '@/lib/zonal/weekly-range';
import type {WeeklySyncStatus} from '@/lib/zonal/weekly-sync-status';
import {syncWeeklyNetSales,weeklySyncProgress} from '@/app/(protected)/dashboard/weekly-sync-action';
const stamp=(value:string|null)=>value?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(value)):'Not yet';
export function WeeklySalesSync({monday,today,initial}:{monday:string;today:string;initial:WeeklySyncStatus}){
 const router=useRouter(),[status,setStatus]=useState(initial),[previous,setPrevious]=useState(initial),[error,setError]=useState(''),[pending,start]=useTransition();
 const seen=useRef(initial),range=weeklySyncRange(monday,today);
 if(previous!==initial){setPrevious(initial);setStatus(initial);}
 useEffect(()=>{
  let active=true,busy=false;
  const refresh=async()=>{if(busy||document.visibilityState!=='visible')return;busy=true;try{
   const next=await weeklySyncProgress(monday);if(!active)return;const old=seen.current;seen.current=next;setStatus(next);
   if(next&&old&&((next.approved!==old.approved)||(old.stage==='Sync Started'&&next.stage!=='Sync Started')))router.refresh();
  }catch{if(active)setError('Sync status is unavailable. Refresh before starting another fetch.');}finally{busy=false;}};
  const timer=setInterval(()=>void refresh(),status?.stage==='Sync Started'?2500:10000);
  const focus=()=>void refresh();window.addEventListener('focus',focus);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus);};
 },[monday,router,status?.stage]);
 return <div className="operational-sync" role="group" aria-label="Weekly sales sync">
  <div className="operational-sync-action"><button className="btn" disabled={pending||status?.stage==='Sync Started'||!range.dates.length} onClick={()=>start(async()=>{
   setError('');try{const result=await syncWeeklyNetSales(monday);if(result.error){setError(result.error);return;}const next=await weeklySyncProgress(monday);seen.current=next;setStatus(next);}catch{setError('Weekly sync could not start. No sales were approved.');}
  })}><RefreshCw size={16}/>{pending?'Starting…':'Sync Weekly Net Sales'}</button><Link className="operational-text-link" href={`/admin/integrations/zonal?date=${monday}#batch-sync`}>Review &amp; approve</Link></div>
  <div className="operational-sync-status" role="status" aria-live="polite">
   {status?<><strong data-sync-stage>{status.stage}</strong><span>{status.fetchCompleted?'Fetch Completed · ':''}{status.partial?'Partial result · ':''}{status.checked}/{status.total} dates checked · {status.approved} approved{status.review?` · ${status.review} require review`:''}{status.failed?` · ${status.failed} failed`:''}{status.unavailable?` · ${status.unavailable} not yet offered by Zonal`:''}</span><small>Last fetch completed: {stamp(status.finishedAt)}{status.latestDate?` · Latest report: ${status.latestDate}`:''}{status.lastApprovedAt?` · Approved: ${stamp(status.lastApprovedAt)}`:''}</small></>:<span>{range.dates.length?'Fetch the selected week, then review before approval.':range.message}</span>}
  </div>
  {error&&<p role="alert" className="operational-sync-error">{error}</p>}
 </div>;
}
