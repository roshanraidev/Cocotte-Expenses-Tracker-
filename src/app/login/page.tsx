import { ChefHat, ShieldCheck, CalendarDays } from 'lucide-react';
import { LoginForm } from '@/components/login-form';
import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
export default async function LoginPage() {
  if (await currentUser()) redirect('/dashboard');
  return <main className="grid min-h-dvh lg:grid-cols-2">
    <section className="relative flex flex-col justify-between bg-[#163b2e] p-8 text-white sm:p-14 lg:p-20">
      <div className="flex items-center gap-3"><ChefHat size={30}/><span className="text-lg font-semibold">Restaurant Food Cost Tracker</span></div>
      <div className="py-12 lg:py-24"><p className="mb-6 text-xs font-semibold uppercase tracking-[.22em] text-[#c6b98c]">A clearer view of your kitchen</p><h1 className="max-w-lg text-4xl leading-tight font-medium sm:text-5xl">Good food.<br/>Thoughtful spending.</h1><p className="mt-7 max-w-md leading-7 text-green-100/75">Your weekly targets, sales, purchasing and stock. One clear view of your kitchen’s financial performance.</p><div className="mt-10 inline-flex items-center gap-3 rounded-full border border-white/20 px-4 py-2 text-sm text-green-100"><CalendarDays size={16}/>Monday to Sunday · GBP · Excluding VAT · London</div></div>
      <p className="text-xs text-green-100/60">Built around the rhythm of your restaurant.</p>
    </section>
    <section className="flex items-center justify-center px-6 py-14 sm:px-14"><div className="w-full max-w-sm"><div className="mb-8"><span className="mb-5 inline-flex rounded-xl bg-[#e7eee6] p-3"><ShieldCheck size={24}/></span><h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2><p className="mt-3 text-sm leading-6 text-stone-500">Sign in with your restaurant account.</p></div><LoginForm/><p className="mt-7 text-center text-xs leading-6 text-stone-500">Need access? Ask your restaurant’s Super User.<br/>Accounts are created by your administrator.</p></div></section>
  </main>;
}
