'use client';
import {usePathname,useRouter} from 'next/navigation';
import {useId} from 'react';
export function WorkspaceSwitcher(){const path=usePathname();const router=useRouter();const id=useId();return <div className="workspace-control"><label htmlFor={id} className="text-[10px]! uppercase tracking-widest text-[#d4c48e]">Workspace</label><select id={id} aria-label="Workspace" className="workspace-select" value={path.startsWith('/packaging')?'packaging':'food'} onChange={e=>router.push(e.target.value==='packaging'?'/packaging':'/dashboard')}><option value="food">Food Purchasing</option><option value="packaging">Packaging & Chemicals</option></select></div>;}
