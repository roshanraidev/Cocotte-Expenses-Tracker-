'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ReceiptText, Truck, ChartNoAxesCombined, Settings2, Store, SlidersHorizontal } from 'lucide-react';
export function Navigation({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const links = [{href:'/dashboard',label:'Dashboard',icon:LayoutDashboard},{href:'/sales',label:'Daily Sales',icon:ReceiptText},{href:'/orders',label:'Supplier Orders',icon:Truck},{href:'/reports',label:'Reports',icon:ChartNoAxesCombined},...(admin?[{href:'/admin/planning',label:'Weekly Planning',icon:SlidersHorizontal},{href:'/suppliers',label:'Supplier Management',icon:Store},{href:'/admin',label:'Administration',icon:Settings2}]:[])];
  return <nav aria-label="Main navigation" className="space-y-1">{links.map(({href,label,icon:Icon})=>{const active=href==='/admin'?pathname===href||pathname.startsWith('/admin/users')||pathname.startsWith('/admin/forecasts'):pathname===href;return <Link key={href} href={href} aria-current={active?'page':undefined} className={`nav-item ${active?'nav-active':''}`} onClick={e=>e.currentTarget.closest('details')?.removeAttribute('open')}><Icon size={19} strokeWidth={1.6}/><span>{label}</span></Link>;})}</nav>;
}
