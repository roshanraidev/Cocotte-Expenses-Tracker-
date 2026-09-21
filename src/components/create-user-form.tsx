'use client';
import { useActionState } from 'react';
import { createUser } from '@/app/(protected)/admin/users/actions';
export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, { error: '', success: '' });
  return <form action={action} className="space-y-4"><div><label htmlFor="name">Full name</label><input name="name" id="name" required maxLength={100}/></div><div><label htmlFor="email">Email</label><input name="email" id="email" type="email" autoComplete="off" required maxLength={254}/></div><div><label htmlFor="password">Password</label><input name="password" id="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/><p className="mt-2 text-xs text-stone-500">At least 12 characters. Share securely with the account holder.</p></div><div><label htmlFor="role">Role</label><select name="role" id="role"><option value="CHEF">Chef</option><option value="SUPER_USER">Super User</option></select></div>{state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.success && <p role="status" className="text-sm text-green-700">{state.success}</p>}<button className="btn" disabled={pending}>{pending ? 'Creating…' : 'Create account'}</button></form>;
}
