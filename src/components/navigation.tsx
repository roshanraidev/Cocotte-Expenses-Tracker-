'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ReceiptText, Truck, Package, ChartNoAxesCombined, Settings2, Store, SlidersHorizontal } from 'lucide-react';
export function Navigation({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const links = [{href:'/dashboard',label:'Overview',icon:LayoutDashboard},{href:'/sales',label:'Daily sales',icon:ReceiptText},{href:'/orders',label:'Orders & invoices',icon:Truck},{href:'/stock',label:'Stock & planning',icon:Package},{href:'/suppliers',label:'Suppliers',icon:Store},{href:'/reports',label:'Reports',icon:ChartNoAxesCombined},...(admin?[{href:'/admin/food-cost',label:'Food cost targets',icon:SlidersHorizontal},{href:'/admin',label:'Administration',icon:Settings2}]:[])];
  return <nav aria-label="Main navigation" className="space-y-1">{links.map(({href,label,icon:Icon})=>{const active=href==='/admin'?pathname===href||pathname.startsWith('/admin/users')||pathname.startsWith('/admin/forecasts'):pathname===href;return <Link key={href} href={href} aria-current={active?'page':undefined} className={`nav-item ${active?'nav-active':''}`} onClick={e=>e.currentTarget.closest('details')?.removeAttribute('open')}><Icon size={19} strokeWidth={1.6}/><span>{label}</span></Link>;})}</nav>;
}
