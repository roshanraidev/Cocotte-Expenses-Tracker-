import Link from 'next/link';
import {Check,TriangleAlert,Truck,ClipboardList,CalendarDays,ChartNoAxesCombined} from 'lucide-react';
import {can} from '@/lib/permissions';
import {db} from '@/lib/db';
import {permittedHome} from '@/lib/navigation';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {londonToday,mondayOf} from '@/lib/dates';
import {dashboardWeek} from '@/lib/zonal/weekly-sales-data';
import {readWeeklySyncStatus} from '@/lib/zonal/weekly-sync-status';
import {WeeklySalesOverview} from '@/components/weekly-sales-overview';
import {WeeklySalesSync} from '@/components/weekly-sales-sync';
import {formatGBP} from '@/lib/money';
import {percentLabel} from '@/lib/targets';
import {MoneyValue} from '@/components/money-value';
import {LiveRefresh} from '@/components/live-refresh';
import './dashboard.css';
export default async function Dashboard(){
 const user=await requireUser();if(!can(user,'dashboard.view'))redirect(permittedHome(user));
 const today=londonToday(),monday=mondayOf(today);
 const {financial:data,overview}=await dashboardWeek(db(),user.restaurantId,monday,today);
 const {finance,target,sales}=data,available=finance?.allowance;
 const canSync=user.role==='SUPER_USER'&&can(user,'sales.view');
 const sync=canSync?await readWeeklySyncStatus(db(),user,monday):null;
 const amount=(value:bigint|null|undefined)=>value==null?'Not available':formatGBP(value);
 const recent=data.invoices.toSorted((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).slice(0,5);
 const actions=[
  ...(can(user,'purchasing.create')&&can(user,'purchasing.approve')?[{href:`/orders?week=${monday}`,label:'Register purchase',icon:Truck}]:[]),
  ...(can(user,'sales.create')?[{href:'/sales',label:'Enter daily sales',icon:ChartNoAxesCombined}]:[]),
  ...(can(user,'reports.view')?[{href:`/reports?week=${monday}`,label:'Reports',icon:ClipboardList}]:[]),
  ...(user.role==='SUPER_USER'&&can(user,'settings.view')?[{href:`/admin/planning?week=${monday}`,label:'Weekly planning',icon:CalendarDays}]:[])
 ];
 return <div className="operational-dashboard"><LiveRefresh/>
  <header className="operational-heading"><div><p className="eyebrow">Cocotte · Food purchasing</p><h1 className="page-title">Kitchen overview</h1></div></header>
  <section className="operational-budget" aria-labelledby="allowance-heading">
   <div className="operational-budget-focus"><h2 className="operational-budget-label" id="allowance-heading">Remaining Food Purchasing Budget</h2><div className="operational-budget-value">{available==null?"Set up this week's plan":<MoneyValue pence={available.toString()}/>}</div><p className="operational-budget-caption">Projected allowance · confirmed purchases deducted</p>
    {available!=null&&<p className="operational-budget-health">{available>=0n?<><Check size={15}/>Within projected budget</>:<><TriangleAlert size={15}/>Over budget by {formatGBP(-available)}</>}</p>}
    {available==null&&<p className="operational-budget-health">A seven-day forecast is required. {user.role==='SUPER_USER'?<Link href={`/admin/planning?week=${monday}`}>Open weekly planning →</Link>:'Ask your Super User to complete weekly planning.'}</p>}
   </div>
   <dl className="operational-budget-facts">{[['Projected weekly net sales',amount(sales?.projectedPence)],['Food purchasing target',percentLabel(target.targetBps)],['Maximum purchasing budget',amount(finance?.purchasingBudget)],['Confirmed food purchases',amount(data.purchases)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>
  {can(user,'sales.view')&&<WeeklySalesOverview data={overview} admin={user.role==='SUPER_USER'} salesView={true} reportsView={can(user,'reports.view')}>{canSync&&<WeeklySalesSync key={monday} monday={monday} today={today} initial={sync}/>}</WeeklySalesOverview>}
  <div className="operational-bottom">
   {can(user,'purchasing.view')&&<section className="operational-purchases"><header className="operational-section-heading"><h2>Recent supplier purchases</h2><Link className="operational-text-link" href={`/orders?week=${monday}`}>View all →</Link></header>{recent.length?<ul>{recent.map(invoice=><li key={invoice.id}><div><strong>{invoice.supplier.name}</strong><small>{new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'Europe/London'}).format(invoice.accountingDate)}</small></div><span>{amount(invoice.amountPence)}</span></li>)}</ul>:<p className="operational-note">No confirmed food purchases for this week.</p>}</section>}
   {actions.length>0&&<nav className="operational-quick-actions" aria-label="Quick actions">{actions.map(({href,label,icon:Icon})=><Link href={href} key={href}><Icon size={17}/>{label}</Link>)}</nav>}
  </div>
  <p className="operational-footnote">GBP · Europe/London · Budget = projected net sales × purchasing target − confirmed food purchases. Stock does not change this allowance.</p>
 </div>;
}
