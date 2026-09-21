'use client';
import { useActionState } from 'react';
import { saveSales } from '@/app/(protected)/sales/actions';
import { dayLabel } from '@/lib/dates';
export function SalesForm({ date, version, amount, reasonRequired }: { date: string; version: number; amount: string; reasonRequired: boolean }) {
  const [state, action, pending] = useActionState(saveSales, { error: '', success: '' });
  return <form action={action} className="space-y-3"><input type="hidden" name="date" value={date}/><input type="hidden" name="version" value={version}/><div><label htmlFor={`amount-${date}`}>Actual sales for {dayLabel(date)} (£)</label><input id={`amount-${date}`} name="amount" inputMode="decimal" type="text" required maxLength={15} pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={amount} placeholder="0.00"/></div><div><label htmlFor={`reason-${date}`}>{reasonRequired ? 'Reason for correction / historical entry' : 'Notes (optional)'}</label><input id={`reason-${date}`} name="reason" required={reasonRequired} minLength={reasonRequired ? 3 : undefined} maxLength={500}/></div>{state.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}{state.success && <p role="status" className="text-sm text-green-800">{state.success}</p>}<button className="btn" disabled={pending}>{pending ? 'Saving…' : version ? 'Save correction' : 'Record actual sales'}</button></form>;
}
