'use client';
import { useActionState } from 'react';
import { login } from '@/app/login/actions';
import { ArrowRight } from 'lucide-react';
export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: '' });
  return <form action={action} className="space-y-5">
    <div><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} placeholder="chef@yourrestaurant.co.uk" /></div>
    <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} /></div>
    {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    <button className="btn w-full" disabled={pending}>{pending ? 'Signing in…' : 'Sign in to your kitchen'}<ArrowRight size={17}/></button>
  </form>;
}
