'use client';
import {usePathname,useRouter} from 'next/navigation';
import {useId} from 'react';
import type {AccessibleWorkspace} from '@/lib/navigation';
export function WorkspaceSwitcher({workspaces}:{workspaces:AccessibleWorkspace[]}){
 const path=usePathname(),router=useRouter(),id=useId();
 if(workspaces.length<2)return null;
 const active=path.startsWith('/packaging')?'packaging':'food';
 return <div className="workspace-control"><label htmlFor={id} className="text-[10px]! uppercase tracking-widest text-[#d4c48e]">Current Workspace</label><select id={id} aria-label="Workspace" className="workspace-select" value={active} onChange={e=>{const workspace=workspaces.find(w=>w.id===e.target.value);if(workspace)router.push(workspace.href);}}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.label}</option>)}</select></div>;
}
