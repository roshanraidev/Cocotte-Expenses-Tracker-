import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateUserForm } from '@/components/create-user-form';
import { deactivateUser } from './actions';
export default async function UsersPage() {
  const actor = await requireAdmin();
  const users = await db().user.findMany({ where: { restaurantId: actor.restaurantId }, select: { id: true, name: true, email: true, role: true, active: true }, orderBy: { createdAt: 'asc' } });
  return <><h1 className="mb-7 text-3xl font-semibold">User management</h1><div className="grid items-start gap-6 xl:grid-cols-[1fr_350px]"><section className="card"><h2 className="mb-4 text-lg font-semibold">Your team</h2><ul className="divide-y divide-stone-100">{users.map(user => <li key={user.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-semibold">{user.name}</p><p className="mt-1 break-all text-sm text-stone-500">{user.email}</p><p className="mt-2 text-xs text-stone-500">{user.role === 'CHEF' ? 'Chef' : 'Super User'} · {user.active ? 'Active' : 'Inactive'}</p></div>{user.active && user.role === 'CHEF' && <form action={deactivateUser}><input type="hidden" name="id" value={user.id}/><button className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700">Deactivate</button></form>}</li>)}</ul></section><section className="card"><h2 className="mb-5 text-lg font-semibold">Add an account</h2><CreateUserForm/></section></div></>;
}
