'use client';
import {useState,useTransition} from 'react';
import Link from 'next/link';
import {CalendarRange,RefreshCw} from 'lucide-react';
import {weekLabel} from '@/lib/dates';
import {weeklySyncRange} from '@/lib/zonal/weekly-range';
import {syncWeeklyNetSales} from '@/app/(protected)/dashboard/weekly-sync-action';
export function WeeklySalesSync({monday,today}:{monday:string;today:string}){
 const [notice,setNotice]=useState<{week:string;error:string;message:string}|null>(null),[pending,start]=useTransition();
 const range=weeklySyncRange(monday,today),current=notice?.week===monday?notice:null;
 return <section className="dashboard-sales-sync" aria-labelledby="weekly-net-sales-sync-title">
  <div className="dashboard-sales-sync-top"><div><span className="sales-eyebrow"><CalendarRange size={15}/> SELECTED DASHBOARD WEEK</span><h2 id="weekly-net-sales-sync-title">Weekly Net Sales</h2><p>{weekLabel(monday)}</p><small>{range.dates.length?`${range.dates.length} completed reporting day${range.dates.length===1?'':'s'} · ${range.from}–${range.to}`:range.message}</small></div>
  <button className="btn" disabled={pending||!range.dates.length} onClick={()=>start(async()=>{const week=monday;setNotice(null);try{setNotice({week,...await syncWeeklyNetSales(week)});}catch{setNotice({week,error:'Weekly sync could not start. Refresh and try again; no sales were approved.',message:''});}})}><RefreshCw size={16}/>{pending?'Starting weekly sync…':'Sync Weekly Net Sales'}</button></div>
  <p className="sales-history-caption mt-3">Sync the selected week and check recent dates for corrections, then review and approve. Existing sales are protected; today and future dates are excluded.</p>
  {current?.error&&<p role="alert" className="sales-history-message">{current.error}</p>}{current?.message&&<p role="status" className="sales-history-message">{current.message}</p>}
  <Link className="sales-review-link mt-2" href={`/admin/integrations/zonal?date=${monday}#batch-sync`}>Review weekly reports and approvals →</Link>
 </section>;
}
