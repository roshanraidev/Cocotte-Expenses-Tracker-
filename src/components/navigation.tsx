'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {LayoutDashboard,ReceiptText,Truck,ChartNoAxesCombined,Settings2,Store,SlidersHorizontal,BookOpen,Users,Boxes} from 'lucide-react';
import type {Permission} from '@/lib/permissions';
import {navigationItems} from '@/lib/navigation';
const icons={dashboard:LayoutDashboard,receipt:ReceiptText,truck:Truck,reports:ChartNoAxesCombined,settings:Settings2,store:Store,planning:SlidersHorizontal,recipes:BookOpen,users:Users,inventory:Boxes};
export function Navigation({admin,permissions}:{admin:boolean;permissions?:readonly Permission[]}){
 const pathname=usePathname(),links=navigationItems({role:admin?'SUPER_USER':'CHEF',permissions},pathname);
 if(!links.length)return null;
 return <nav aria-label="Main navigation" className="space-y-1">{links.map(({href,label,icon,group},index)=>{
  const Icon=icons[icon],active=href==='/admin'?pathname===href||pathname.startsWith('/admin/forecasts')||pathname.startsWith('/admin/food-cost')||pathname.startsWith('/admin/integrations'):pathname===href||(href!=='/packaging'&&pathname.startsWith(href+'/'));
  return <Link key={href} href={href} aria-current={active?'page':undefined} className={`nav-item ${active?'nav-active':''} ${index>0&&links[index-1].group!==group?'nav-section-start':''}`} onClick={e=>e.currentTarget.closest('details')?.removeAttribute('open')}><Icon size={19} strokeWidth={1.6}/><span>{label}</span></Link>;
 })}</nav>;
}
