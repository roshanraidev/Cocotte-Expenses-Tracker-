'use client';
import {useState,useEffect,useRef} from 'react';
import type {ZonalState} from './actions';
import Link from 'next/link';
import { CheckCircle2,Clock3,TriangleAlert,ReceiptText } from 'lucide-react';
import type { ApprovalAssessment } from '@/lib/zonal/approval';
import { formatGBP } from '@/lib/money';
import { dayLabel } from '@/lib/dates';
import { moneyFields } from '@/lib/zonal/validation';
import { ApprovalForm } from './forms';
type Item={id:string;branch:string;source:string;createdAt:string;assessment:ApprovalAssessment};
const labels={gross:'Gross sales',discount:'Discounts',vat:'VAT',net:'Net sales',food:'Food net sales',drink:'Drink net sales',specials:'Specials net sales'};
const stamp=(date:Date)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(date);
export function ReviewPreviews({items}:{items:Item[]}){
 const [notification,setNotification]=useState<ZonalState|null>(null);
 const resultRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(notification)resultRef.current?.scrollIntoView({block:'nearest'});},[notification]);
 const dates=[...new Set(items.map(item=>item.assessment.date))].sort().reverse();
 return <section className="card" aria-labelledby="review-heading"><h2 id="review-heading" className="flex items-center gap-2 text-lg font-semibold"><ReceiptText size={19}/>Review & approve</h2>
  <p className="mt-2 text-xs leading-6 text-stone-500">Grouped by report date. Each preview is checked against the live weekly plan and Daily Sales. Approval is always explicit.</p>
  {notification&&<div ref={resultRef} role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"><p className="font-semibold">{notification.success}</p>{notification.approvedWeek&&<div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold underline"><Link href={`/dashboard?week=${notification.approvedWeek}`}>View this week’s dashboard</Link><Link href={`/sales?date=${notification.approvedDate}`}>View Daily Sales</Link><Link href={`/reports?week=${notification.approvedWeek}&tab=sales`}>View weekly report</Link></div>}</div>}
  {!items.length&&<p className="my-6 rounded-xl border border-dashed border-stone-200 p-6 text-center text-sm text-stone-500">Your next report preview will appear here.</p>}
  {dates.map(date=>{const group=items.filter(item=>item.assessment.date===date);return <section key={date} className="mt-6 border-t border-stone-100 pt-5" aria-label={`Reports for ${date}`}>
    <header className="mb-4"><h3 className="font-semibold">{dayLabel(date)} {date.slice(0,4)}</h3><p className="mt-1 text-xs leading-5 text-stone-500">Monday–Sunday · {group[0].assessment.week}</p><p className="mt-1 text-xs text-stone-500">{group.length} preview{group.length===1?'':'s'} · {group.filter(item=>item.assessment.canApprove).length} ready for review</p></header>
    <div className="space-y-4">{group.map(item=>{const a=item.assessment;const ready=a.canApprove;const Icon=ready?CheckCircle2:a.state==='expired'?Clock3:TriangleAlert;
      const status=({ready:'Ready to approve',correction:'Correction approval required',blocked:'Blocked',expired:'Expired',superseded:'Newer preview available'})[a.state];
      return <article id={`preview-${item.id}`} key={item.id} className={`scroll-mt-5 rounded-xl border p-4 ${ready?'border-[#cbdccc] bg-[#f9fbf6]':'border-stone-200 bg-[#fafaf6]'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><span className={`inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold ${ready?'bg-green-100 text-green-900':a.state==='expired'?'bg-stone-200 text-stone-600':'bg-[#f2ead4] text-[#78612d]'}`}><Icon size={14}/>{status}</span><time className="text-[11px] text-stone-500">{stamp(new Date(item.createdAt))}</time></div>
        <p className="mt-3 text-xs text-stone-500">{item.source==='ZONAL_BROWSER'?'Zonal browser · Financial Detail':'Manual Financial Detail'} · {item.branch}</p>
        {a.report?<><p className="mt-3 text-xs text-stone-500">Net sales to record</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatGBP(BigInt(a.report.net))}</p><details className="mt-3" open={ready}><summary className="text-xs font-semibold">Report figures</summary><dl className="mt-3 grid grid-cols-2 gap-3 text-xs">{moneyFields.filter(key=>key!=='net').map(key=><div key={key}><dt className="text-stone-500">{labels[key]}</dt><dd className="mt-1 font-semibold">{formatGBP(BigInt(a.report![key]))}</dd></div>)}<div><dt className="text-stone-500">Covers / Transactions</dt><dd className="mt-1 font-semibold">{a.report.covers??'Unavailable'} / {a.report.transactions??'Unavailable'}</dd></div></dl></details></>:<p className="notice mt-4">Figures are unavailable because report validation failed. Nothing can be imported from this preview.</p>}
        {a.issues.length?<ul className="mt-4 space-y-3">{a.issues.map(issue=><li key={issue.code} className="rounded-lg border border-[#e8dfc5] bg-[#faf6e9] p-3 text-xs leading-6 text-[#78612d]"><p>{issue.message}</p><Link href={issue.href} className="font-semibold underline underline-offset-2">{issue.action} →</Link></li>)}</ul>:<p className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-xs leading-6 text-green-900"><CheckCircle2 size={15} className="mt-1 shrink-0"/>The seven-day forecast exists, the week is open and no Daily Sales record exists for this date. Ready for your approval.</p>}
        <ApprovalForm id={item.id} conflict={a.conflict} blocked={!a.canApprove} reasonRequired={a.reasonRequired} onResult={setNotification}/>
      </article>;
    })}</div>
   </section>;})}
 </section>;
}
