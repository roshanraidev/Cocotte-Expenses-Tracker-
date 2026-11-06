'use client';
import { useEffect,useState,useTransition } from 'react';
import Link from 'next/link';
import { RefreshCw,ShieldCheck,CalendarRange } from 'lucide-react';
import type { BatchOverview } from '@/lib/zonal/batch';
import { addDays } from '@/lib/dates';
import { syncDates,previousWeek } from '@/lib/zonal/batch-dates';
import { formatGBP } from '@/lib/money';
import { readBatches,syncBatch,stopBatch,approveSyncBatch } from './batch-actions';
const money=(v:string|undefined)=>v===undefined?'—':formatGBP(BigInt(v));
export function BatchPanel({initial,ready,today}:{initial:BatchOverview;ready:boolean;today:string}){
 const [batches,setBatches]=useState(initial),[mode,setMode]=useState('current'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[pending,start]=useTransition();
 const [previous,setPrevious]=useState(initial);
 if(previous!==initial){setPrevious(initial);setBatches(initial);}
 const completed=batches.find(batch=>batch.status==='COMPLETED');
 const completedAt=completed?.finishedAt?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(completed.finishedAt)):'No complete batch yet';
 const running=batches.some(batch=>batch.status==='RUNNING');
 useEffect(()=>{
  if(!running)return;
  let active=true,busy=false;
  const timer=setInterval(()=>{if(busy)return;busy=true;void readBatches().then(rows=>{if(active)setBatches(rows);}).catch(()=>{if(active)setError('Progress unavailable. The server may still be fetching; refresh before starting another sync.');}).finally(()=>{busy=false;});},2500);
  return ()=>{active=false;clearInterval(timer);};
 },[running]);
 let range;let rangeError='';
 try{range=syncDates(mode,from,to,new Date(today+'T12:00:00Z'));}catch(error){rangeError=error instanceof Error?error.message:'Choose a date range.';}
 async function refresh(){setBatches(await readBatches());}
 return <section className="card my-6 border-t-4 border-t-[#b59c60]" id="batch-sync">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Read-only · manual synchronisation</p><h2 className="flex items-center gap-2 text-xl font-semibold"><RefreshCw size={20}/>Sync Zonal</h2><p className="mt-2 text-sm text-stone-500">003 – Parsons Green · collect completed days, review together, approve explicitly.</p></div><span className="badge"><ShieldCheck size={14}/>Super User</span></div>
  <form onChange={event=>{event.currentTarget.dataset.dirty='true';}} onSubmit={event=>{event.currentTarget.dataset.dirty='false';}} className="mt-5 space-y-4" action={form=>start(async()=>{setError('');setNotice('');const result=await syncBatch(form);setError(result.error);setNotice(result.message);await refresh();})}>
   <div className="flex flex-wrap items-end gap-3"><label style={{display:'grid'}} className="gap-1 text-sm">Date selection<select name="mode" value={mode} onChange={e=>setMode(e.target.value)} className="input"><option value="current">Current week · Monday through yesterday</option><option value="custom">Custom date range · up to 31 days</option></select></label><button type="button" className="btn btn-secondary" onClick={()=>{const week=previousWeek(new Date(today+'T12:00:00Z'));setMode('custom');setFrom(week.from);setTo(week.to);}}><CalendarRange size={15}/>Previous week</button>
   {mode==='custom'&&<><label style={{display:'grid'}} className="gap-1 text-sm">From<input className="input" type="date" name="from" value={from} max={range?.to??today} onChange={e=>setFrom(e.target.value)} required/></label><label style={{display:'grid'}} className="gap-1 text-sm">To<input className="input" type="date" name="to" value={to} max={addDays(today,-1)} onChange={e=>setTo(e.target.value)} required/></label></>}
   <button className="btn" disabled={!ready||running||pending||!!rangeError||!range?.dates.length}>{pending?'Starting…':running?'Sync in progress…':'Sync Zonal'}</button></div>
   <p className="text-xs text-stone-500">{range?.message||rangeError||`${range?.from} — ${range?.to} · ${range?.dates.length} completed days · Europe/London`}</p>
   {!ready&&<p className="notice">Connect the verified Parsons Green branch before syncing.</p>}
  </form>
  {error&&<p role="alert" className="notice mt-4 text-red-800">{error}</p>}{notice&&<p role="status" className="notice mt-4">{notice}</p>}
  <p className="mt-4 text-xs text-stone-500">Last completed fetch: {completedAt} · approval status is shown separately below.</p>
  <div className="mt-6 space-y-6">{batches.map(batch=><BatchReview key={batch.id} batch={batch} busy={pending} onApprove={form=>start(async()=>{setError('');const result=await approveSyncBatch(form);setError(result.error);setNotice(result.message);await refresh();})} onCancel={()=>start(async()=>{await stopBatch(batch.id);await refresh();})}/>)}</div>
  {!batches.length&&<div className="mt-6 rounded-xl bg-[#f8f5ec] p-6 text-sm text-stone-500">Your first sync will show daily reports and their approval readiness here. Fetching never changes Daily Sales.</div>}
 </section>;
}
function BatchReview({batch,busy,onApprove,onCancel}:{batch:BatchOverview[number];busy:boolean;onApprove:(form:FormData)=>void;onCancel:()=>void}){
 const [selected,setSelected]=useState<string[]>([]);
 const eligible=batch.days.filter(day=>day.eligible&&day.previewId);
 const chosen=eligible.filter(day=>selected.includes(day.previewId!));
 const total=batch.days.reduce((sum,day)=>sum+BigInt(day.report?.net??'0'),0n);
 const selectedNet=chosen.reduce((sum,day)=>sum+BigInt(day.report!.net),0n);
 const counts=(statuses:string[])=>batch.days.filter(day=>statuses.includes(day.status)).length;
 const checked=batch.days.filter(day=>day.attempted).length;
 const labels:Record<string,string>={NEW:'New — ready',UNCHANGED:'Unchanged — already imported',CHANGED:'Changed — correction approval',BLOCKED:'Blocked',EXPIRED:'Expired — fetch again',FAILED:'Failed',APPROVED:'Approved',PENDING:'Waiting'};
 return <article className="overflow-hidden rounded-xl border border-stone-200">
  <div className="bg-[#f8f5ec] p-4 sm:p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{batch.from} — {batch.to}</h3><p className="mt-1 text-xs text-stone-500">{batch.branch} · {batch.status.toLowerCase()} · {checked} of {batch.days.length} dates checked</p></div>{batch.status==='RUNNING'&&<button type="button" onClick={onCancel} disabled={busy} className="btn btn-secondary">Cancel sync</button>}</div>
  <progress style={{accentColor:'#315944'}} className="mt-3 h-1 w-full" value={checked} max={batch.days.length} aria-label="Dates checked"/>
  <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">{[['New',counts(['NEW'])],['Unchanged',counts(['UNCHANGED'])],['Changed',counts(['CHANGED'])],['Blocked / failed',counts(['BLOCKED','FAILED','EXPIRED'])],['Approved',counts(['APPROVED'])]].map(([label,value])=><div key={label}><p className="text-stone-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div>
  <p className="mt-4 text-sm font-semibold">Retrieved report total: {formatGBP(total)} <span className="font-normal text-stone-500">· preview, including unchanged reports; not an approved sales total</span></p>
  </div>
  <form action={onApprove} onChange={event=>{event.currentTarget.dataset.dirty='true';}} onSubmit={event=>{event.currentTarget.dataset.dirty='false';}}>
  <input type="hidden" name="batchId" value={batch.id}/>
  <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b bg-white"><tr>{['Select / date','Net sales','Food','Drinks','Specials','VAT','Status'].map(label=><th className="whitespace-nowrap px-3 py-3 font-semibold" key={label}>{label}</th>)}</tr></thead><tbody>{batch.days.map(day=><tr key={day.id} className="border-b align-top"><td className="min-w-40 px-3 py-4">{day.eligible&&day.previewId&&<input aria-label={`Approve ${day.date}`} name="previewId" type="checkbox" value={day.previewId} checked={selected.includes(day.previewId)} onChange={e=>setSelected(old=>e.target.checked?[...old,day.previewId!]:old.filter(id=>id!==day.previewId))} className="mr-2 shrink-0 accent-[#315944]" disabled={batch.status==='RUNNING'}/>}<span className="font-medium">{day.date}</span><details className="mt-2"><summary className="cursor-pointer text-[#315944]">Report details</summary><div className="mt-2 space-y-2 text-stone-500"><p>Gross {money(day.report?.gross)} · Discounts {money(day.report?.discount)}</p><p>Covers {day.report?.covers??'—'} · Transactions {day.report?.transactions??'—'}</p><p>{batch.branch} · GBP · read-only Financial Detail</p>{day.previous!==null&&<p>Existing net {money(day.previous)} → report net {money(day.report?.net)}</p>}{day.report&&<p>Branch, date, GBP, summary and department totals validated.</p>}{day.previewId&&<a href={day.status==='APPROVED'||day.status==='UNCHANGED'?`#history-${day.previewId}`:`#preview-${day.previewId}`} className="underline">Individual review / audit</a>}</div></details></td>{(['net','food','drink','specials','vat'] as const).map(field=><td key={field} className="whitespace-nowrap px-3 py-4 tabular-nums">{money(day.report?.[field])}</td>)}<td className="min-w-56 px-3 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${day.status==='FAILED'||day.status==='BLOCKED'||day.status==='EXPIRED'?'bg-amber-50 text-amber-900':'bg-green-50 text-green-900'}`}>{labels[day.status]??day.status}</span>{day.issues.map(issue=><p key={issue.code} className="mt-3 leading-5 text-stone-600">{issue.message} <Link className="font-semibold text-[#315944] underline" href={issue.href}>{issue.action}</Link></p>)}{day.error&&<p className="mt-3 text-red-800">{day.error}</p>}{day.approvalError&&<p className="mt-3 text-red-800">{day.approvalError}</p>}</td></tr>)}</tbody></table></div>
  {batch.status!=='RUNNING'&&eligible.length>0&&<div className="space-y-3 p-4 sm:p-5"><div className="flex flex-wrap items-center gap-3"><h4 className="font-semibold">Review & Approve Imports</h4><button type="button" className="text-xs text-[#315944] underline" onClick={()=>setSelected(eligible.filter(day=>day.status==='NEW').map(day=>day.previewId!))}>Select eligible new days</button></div><p className="text-sm">{chosen.length} selected of {eligible.length} eligible days · {formatGBP(selectedNet)} net sales</p>{chosen.some(day=>day.status==='CHANGED')&&<label style={{display:'flex'}} className="items-start gap-3 text-sm leading-6"><input className="shrink-0" type="checkbox" name="overwrite" required/>I explicitly approve replacing the selected existing Daily Sales values.</label>}<label style={{display:'grid'}} className="gap-2 text-sm">Audit reason {chosen.some(day=>day.reasonRequired)?'(required for historical imports / corrections)':'(optional)'}<textarea className="w-full rounded-xl border border-stone-300 bg-white p-3 text-base font-normal text-[#203a30] outline-offset-2 focus:outline-[#b7a76d]" rows={3} name="reason" maxLength={500} minLength={chosen.some(day=>day.reasonRequired)?3:undefined} required={chosen.some(day=>day.reasonRequired)} placeholder="Explain the historical import or correction"/></label><label style={{display:'flex'}} className="items-start gap-3 text-sm leading-6"><input className="shrink-0" type="checkbox" name="confirm" required/>I have reviewed these dates and approve importing {formatGBP(selectedNet)} into Daily Sales.</label><button className="btn" disabled={busy||!chosen.length}>{busy?'Processing…':`Approve ${chosen.length} selected days`}</button><p className="text-xs text-stone-500">Each date is checked again under financial locks. Blocked or failed dates remain available for review.</p></div>}
  </form>
 </article>;
}
