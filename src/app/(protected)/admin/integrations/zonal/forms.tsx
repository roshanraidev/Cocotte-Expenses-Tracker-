'use client';
import { useActionState } from 'react';
import { zonalAction } from './actions';
import { moneyFields } from '@/lib/zonal/validation';
function Feedback({ error, success }: { error: string; success: string }) { return <div aria-live="polite">{error && <p role="alert" className="notice mt-4">{error}</p>}{success && <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-900">{success}</p>}</div>; }
export function ConnectionForm() {
  const [state, action, pending] = useActionState(zonalAction, { error: '', success: '' });
  return <form action={action}><input type="hidden" name="action" value="test"/><button className="btn btn-secondary" disabled={pending}>{pending ? 'Checking configuration…' : 'Test connection readiness'}</button><Feedback {...state}/></form>;
}
export function FetchForm({ready,branch,today,defaultDate}:{ready:boolean;branch:string;today:string;defaultDate:string}) {
  const [state,action,pending]=useActionState(zonalAction,{error:'',success:''} as import('./actions').ZonalState);
  return <form action={action} className="my-5 rounded-xl border border-[#d9e3d5] bg-[#f7f8f1] p-5">
    <input type="hidden" name="action" value="extract"/>
    <h3 className="font-semibold">Fetch from Zonal</h3>
    <p className="mt-2 text-xs leading-6 text-stone-500">Financial Detail · {branch || 'Connect your restaurant first'}. A secure read creates a preview for your approval.</p>
    <label className="mt-4" htmlFor="fetch-date">Reporting date</label><input id="fetch-date" name="date" type="date" required max={today} defaultValue={defaultDate} disabled={pending}/>
    <button className="btn mt-4" disabled={!ready||pending}>{pending?'Fetching Financial Detail…':'Fetch from Zonal'}</button>
    {!ready&&<p className="mt-3 text-xs text-stone-500">Configure the encrypted Parsons Green connection above to enable live fetching.</p>}
    {pending&&<p role="status" className="mt-3 text-xs leading-6 text-stone-500">Opening a temporary browser, reading the report and validating totals. This can take around 90 seconds. Daily Sales will not change.</p>}
    <Feedback {...state}/>{state.previewId&&<a href={`#preview-${state.previewId}`} className="mt-3 inline-block text-sm font-semibold underline">Review fetched sales</a>}
  </form>;
}
export function ReportForm({ branch, today }: { branch: string; today: string }) {
  const [state, action, pending] = useActionState(zonalAction, { error: '', success: '' });
  return <form action={action} className="mt-5"><input type="hidden" name="action" value="preview"/><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="branch">Zonal branch (match report exactly)</label><input id="branch" name="branch" required defaultValue={branch} maxLength={120}/></div><div><label htmlFor="report-date">Reporting date</label><input id="report-date" name="date" type="date" required max={today} defaultValue={today}/></div><div><label htmlFor="currency">Report currency</label><select id="currency" name="currency"><option>GBP</option></select></div>{moneyFields.map(key => <div key={key}><label htmlFor={key}>{({ gross: 'Gross sales (after discounts)', discount: 'Discounts', vat: 'VAT', net: 'Net sales', food: 'Food net sales', drink: 'Drink net sales', specials: 'Specials net sales' })[key]} · GBP</label><input id={key} name={key} inputMode="decimal" placeholder="Enter report value" required maxLength={24}/></div>)}{['covers', 'transactions'].map(key => <div key={key}><label htmlFor={key}>{key === 'covers' ? 'Covers' : 'Transaction count'} · optional</label><input id={key} name={key} inputMode="numeric" placeholder="Leave blank if unavailable" maxLength={9}/></div>)}</div><p className="my-4 text-xs leading-6 text-stone-500">Read the Financial Detail report and enter its figures. Missing amounts must be resolved before preview. Department rounding tolerance: 1p. Zonal Cost % is never imported.</p><button className="btn" disabled={pending || !branch}>{pending ? 'Validating report…' : 'Preview sales import'}</button><Feedback {...state}/></form>;
}
export function ApprovalForm({ id, conflict,blocked=false,reasonRequired=false,onResult }: { id: string; conflict: boolean;blocked?:boolean;reasonRequired?:boolean;onResult?:(state:import('./actions').ZonalState)=>void }) {
  const [state, action, pending] = useActionState(async(previous:import('./actions').ZonalState,form:FormData)=>{const next=await zonalAction(previous,form);if(next.success)onResult?.(next);return next;}, { error: '', success: '' } as import('./actions').ZonalState);
  return <form action={action} className="mt-4" onChange={event=>{event.currentTarget.dataset.dirty='true';}} onSubmit={event=>{event.currentTarget.dataset.dirty='false';}}><input type="hidden" name="id" value={id}/>{!blocked&&<>{conflict && <label className="flex items-start gap-3 leading-6"><input name="overwrite" type="checkbox" required/>I explicitly approve correcting the existing Daily Sales value for this date.</label>}<label htmlFor={`reason-${id}`} className="mt-4">Reason for import / correction{reasonRequired?' · required':''}</label><input id={`reason-${id}`} name="reason" maxLength={500} required={reasonRequired} minLength={reasonRequired?3:undefined} placeholder="Explain corrections or historical entries"/></>}<div className="mt-4 flex flex-wrap gap-3"><button className="btn" name="action" value="approve" disabled={pending||blocked}>{pending?'Processing…':blocked?'Approval blocked':'Approve import'}</button><button className="btn btn-secondary" name="action" value="cancel" formNoValidate disabled={pending}>Cancel preview</button></div><Feedback {...state}/>{!onResult&&state.approvedWeek&&<div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold underline"><a href={`/dashboard?week=${state.approvedWeek}`}>View this week’s dashboard</a><a href={`/sales?date=${state.approvedDate}`}>View Daily Sales</a><a href={`/reports?week=${state.approvedWeek}&tab=sales`}>View weekly report</a></div>}</form>;
}
