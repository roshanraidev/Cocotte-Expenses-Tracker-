'use client';
import { useActionState } from 'react';
import {usePermission} from './permission-provider';
import { saveSales } from '@/app/(protected)/sales/actions';
import { dayLabel } from '@/lib/dates';
export function SalesForm({ date, version, amount, reasonRequired }: { date: string; version: number; amount: string; reasonRequired: boolean }) {
  const [state, action, pending] = useActionState(saveSales, { error: '', success: '' });
  const allowed=usePermission(version?'sales.correct':'sales.create');if(!allowed)return null;
  return <form action={action} className="space-y-3">{version>0&&<p className="notice"><strong>Correction Required</strong> · Existing official net sales: £{amount}. Saving a different value updates this same record and requires correction permission and an audit reason.</p>}<input type="hidden" name="date" value={date}/><input type="hidden" name="version" value={version}/><div><label htmlFor={`amount-${date}`}>Actual sales for {dayLabel(date)} (£)</label><input id={`amount-${date}`} name="amount" inputMode="decimal" type="text" required maxLength={15} pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={amount} placeholder="0.00"/></div><div><label htmlFor={`reason-${date}`}>{reasonRequired ? 'Reason for correction / historical entry' : 'Notes (optional)'}</label><input id={`reason-${date}`} name="reason" required={reasonRequired} minLength={reasonRequired ? 3 : undefined} maxLength={500}/></div>{state.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}{state.success && <p role="status" className="text-sm text-green-800">{state.success}</p>}<button className="btn" disabled={pending}>{pending ? 'Saving…' : version ? 'Save correction' : 'Record actual sales'}</button></form>;
}
