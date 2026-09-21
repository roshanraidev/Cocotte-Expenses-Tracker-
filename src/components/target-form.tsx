'use client';
import { useActionState } from 'react';
import { updateTarget } from '@/app/(protected)/admin/food-cost/actions';
import { percentInput } from '@/lib/targets';
export function TargetForm({ monday, targetBps, version, isDefault = false, historical = false }: { monday: string; targetBps: number; version: number; isDefault?: boolean; historical?: boolean }) {
  const [state, action, pending] = useActionState(updateTarget, { error: '', success: '' });
  const prefix = isDefault ? 'default' : 'weekly';
  return <form action={action} className="space-y-4"><input type="hidden" name="scope" value={isDefault ? 'default' : 'weekly'}/><input type="hidden" name="weekStart" value={monday}/><input type="hidden" name="version" value={version}/><div><label htmlFor={`${prefix}-target`}>{isDefault ? 'Default target (%)' : 'Weekly target (%)'}</label><input id={`${prefix}-target`} name="percentage" inputMode="decimal" defaultValue={percentInput(targetBps)} required maxLength={6}/></div><div><label htmlFor={`${prefix}-reason`}>Reason {historical ? '(required for completed weeks)' : '(optional)'}</label><input id={`${prefix}-reason`} name="reason" required={historical} minLength={historical ? 3 : undefined} maxLength={500}/></div>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}<button className="btn" disabled={pending}>{pending ? 'Saving…' : isDefault ? 'Save default target' : 'Save weekly target'}</button></form>;
}
