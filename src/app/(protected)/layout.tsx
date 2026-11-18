import {accessibleWorkspaces,permittedHome} from '@/lib/navigation';
import {ROLE_LABELS} from '@/lib/permissions';
import Link from 'next/link';
import { ChefHat, LogOut } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { logout } from '@/app/login/actions';
import { ApplicationShell } from '@/components/application-shell';
import {PermissionProvider} from '@/components/permission-provider';
import './navigation-shell.css';
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user=await requireUser();const restaurant=await db().restaurant.findUniqueOrThrow({where:{id:user.restaurantId}});
  const workspaces=accessibleWorkspaces(user),home=permittedHome(user);
  const brand=<Link href={home} aria-label={restaurant.name+' home'} className="flex items-center gap-3 text-white"><span className="brand-mark"><ChefHat size={25} strokeWidth={1.5}/></span><span className="brand-name">{restaurant.name}<span className="mt-1 block text-[10px] font-medium uppercase tracking-[.22em] text-[#c6b98c]">Kitchen intelligence</span></span></Link>;
  const account=<div className="sidebar-profile"><span className="profile-avatar">{user.name.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase()}</span><div><p>{user.name}</p><small>{user.accessRole?ROLE_LABELS[user.accessRole]:user.role==='SUPER_USER'?'Super User':'Chef'}</small></div><form action={logout}><button className="profile-signout" aria-label="Sign out" title="Sign out"><LogOut size={17}/></button></form></div>;
  return <ApplicationShell brand={brand} account={account} admin={user.role==='SUPER_USER'} permissions={user.permissions} workspaces={workspaces}><PermissionProvider permissions={user.permissions} superUser={user.role==='SUPER_USER'}>{children}</PermissionProvider></ApplicationShell>;
}
