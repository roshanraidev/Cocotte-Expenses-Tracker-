'use client';
import Link from 'next/link';
import {Fragment} from 'react';
import {NavigationSpecials} from './kitchen/navigation-specials';
import {usePathname} from 'next/navigation';
import {LayoutDashboard,ReceiptText,Truck,ChartNoAxesCombined,Settings2,Store,SlidersHorizontal,BookOpen,Users,Boxes,Bell} from 'lucide-react';
import type {Permission} from '@/lib/permissions';
import {navigationActive,navigationItems} from '@/lib/navigation';
export const navigationIcons={dashboard:LayoutDashboard,receipt:ReceiptText,truck:Truck,reports:ChartNoAxesCombined,settings:Settings2,store:Store,planning:SlidersHorizontal,recipes:BookOpen,users:Users,inventory:Boxes,notifications:Bell};
export function Navigation({admin,permissions}:{admin:boolean;permissions?:readonly Permission[]}){
 const pathname=usePathname(),links=navigationItems({role:admin?'SUPER_USER':'CHEF',permissions},pathname);
 if(!links.length)return null;
 return <nav aria-label="Main navigation" className="space-y-1">{links.map(({href,label,icon,group},index)=>{
  const Icon=navigationIcons[icon],active=navigationActive(href,pathname);
  return <Fragment key={href}><Link href={href} title={label} aria-current={active?'page':undefined} className={`nav-item ${active?'nav-active':''} ${index>0&&links[index-1].group!==group?'nav-section-start':''}`} onClick={e=>e.currentTarget.closest('details')?.removeAttribute('open')}><Icon size={19} strokeWidth={1.6}/><span className="nav-label">{label}</span><span className="rail-tooltip" aria-hidden="true">{label}</span></Link>{href==='/recipes'&&<NavigationSpecials/>}</Fragment>;
 })}</nav>;
}
