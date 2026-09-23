import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { londonToday, mondayOf, dayLabel, dateValue, addDays } from '@/lib/dates';
import { selectedWeek } from '@/lib/week-data';
import { financialWeek } from '@/lib/financial-data';
import { formatGBP } from '@/lib/money';
import { percentLabel } from '@/lib/targets';
import { WeekNavigation } from '@/components/week-navigation';
import { MoneyValue } from '@/components/money-value';
import { cumulativeSales } from '@/lib/reporting';
import { ReportChart } from '@/components/report-chart';
import { LiveRefresh } from '@/components/live-refresh';
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const user = await requireUser();
  const today = londonToday();
  const monday = selectedWeek((await searchParams).week, today);
  const data = await financialWeek(user.restaurantId, monday, today);
  const { days, sales, finance, target } = data;
  const recentOrders = await db().purchaseInvoice.findMany({where:{restaurantId:user.restaurantId,confirmedAt:{not:null},voidedAt:null,accountingDate:{gte:dateValue(monday),lte:dateValue(addDays(monday,6))}},include:{supplier:true},orderBy:{createdAt:'desc'},take:5});
  const amount = (value: bigint | null | undefined) => value == null ? '—' : formatGBP(value);
  const available = finance?.allowance;
  const cumulative = cumulativeSales(days);
  const breakdown = [
    ['Updated projected weekly net sales', amount(sales?.projectedPence)],
    ['Weekly food cost target', percentLabel(target.targetBps)],
    ['Maximum weekly purchasing budget', amount(finance?.purchasingBudget)],
    ['Confirmed purchases', amount(data.purchases)],
    ['Remaining available to spend', amount(available)],
  ];
  return <><LiveRefresh/><header className="dashboard-heading"><div><p className="eyebrow">Food Purchasing · Weekly overview</p><h1 className="page-title">Dashboard</h1></div><p className="page-description">A clear view of your kitchen’s week.</p></header>
    <WeekNavigation monday={monday} path="/dashboard" current={mondayOf(today)}/>
    <section className="allowance-hero dashboard-allowance" aria-labelledby="allowance-heading">
      <div className="allowance-focus"><h2 id="allowance-heading" className="text-sm font-semibold tracking-[0.16em] text-[#e0d1a0]">WEEKLY AVAILABLE TO SPEND</h2>
      <div className={`my-5 font-semibold tracking-tight ${available == null ? 'allowance-unplanned' : ''}`} style={{fontSize: available == null ? 'clamp(1.7rem,4vw,3rem)' : 'clamp(2.4rem,7vw,5.5rem)', lineHeight:1.12, overflowWrap:'anywhere'}}>
        {available == null ? "Set up this week's plan" : <MoneyValue pence={available.toString()}/>}
      </div>
      <p className="text-sm text-white/75">PROJECTED purchasing allowance · Mon–Sun</p>
      {available != null && available < 0n && <p role="status" className="mt-4 rounded-lg border border-[#e0d1a0]/50 p-3 text-sm text-[#fff0c1]">Over budget: confirmed purchases exceed the projected allowance by {formatGBP(-available)}.</p>}
      {available == null && <p className="mt-4 text-sm text-white/85">A seven-day forecast, opening stock and expected closing stock are required. {user.role === 'SUPER_USER' ? <Link className="underline" href={`/admin/planning?week=${monday}`}>Set up weekly planning →</Link> : 'Ask your Super User to complete weekly planning.'}</p>}
      <Link className="allowance-explanation" href={`/reports?week=${monday}&tab=purchasing`}>How was this calculated? <span aria-hidden="true">↗</span></Link></div>
      <dl className="allowance-breakdown">{breakdown.map(([label,value]) => <div key={label}><dt className="text-xs text-white/65">{label}</dt><dd className="mt-1 font-medium tabular-nums">{value}</dd></div>)}</dl>
    </section>
    <div className="dashboard-actions"><Link className="btn" href="/sales">ENTER TODAY&apos;S SALES</Link><Link className="btn btn-secondary" href={`/orders?week=${monday}`}>RECORD SUPPLIER PURCHASE</Link></div>
    <div className="dashboard-grid"><section className="card dashboard-sales"><div className="panel-heading flex flex-wrap items-center justify-between gap-3"><h2 className="section-title">Weekly Sales Performance</h2><Link className="text-sm underline" href={`/reports?week=${monday}&tab=sales`}>View detailed sales report</Link></div>
      <div className="overflow-x-auto"><table className="data-table compact-sales"><thead><tr><th>Day</th><th>Forecast</th><th>Actual</th><th>Variance</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><td><abbr className="no-underline" title={dayLabel(day.date)}>{dayLabel(day.date).slice(0,3)}</abbr></td><td>{amount(day.originalPence)}</td><td>{amount(day.actualPence)}</td><td className={day.actualPence == null ? '' : day.actualPence >= day.originalPence ? 'text-[#285440]' : 'text-amber-800'}>{day.actualPence == null ? '—' : amount(day.actualPence - day.originalPence)}</td></tr>)}</tbody></table></div>
      {!days.length && <p className="py-4 text-sm text-stone-500">No forecast has been entered for this week.</p>}
      <p className="mt-4 text-xs text-stone-500">{sales?.recordedDays ?? 0}/7 actual sales days recorded. Unrecorded days retain their original forecast.</p>
    </section>
    <section className="card dashboard-cumulative"><div className="panel-heading"><h2 className="section-title">Cumulative sales</h2><p className="page-description">Original forecast and recorded actuals · net £</p></div><ReportChart kind="sales" rows={cumulative.map(d=>({label:dayLabel(d.date).slice(0,3),forecast:Number(d.cumulativeForecast)/100,forecastExact:amount(d.cumulativeForecast),actual:d.cumulativeActual===null?null:Number(d.cumulativeActual)/100,actualExact:amount(d.cumulativeActual)}))}/><details className="chart-data"><summary>View cumulative figures</summary><div className="overflow-x-auto"><table className="data-table compact-sales"><thead><tr><th>Day</th><th>Forecast</th><th>Actual</th></tr></thead><tbody>{cumulative.map(d=><tr key={d.date}><td>{dayLabel(d.date).slice(0,3)}</td><td>{amount(d.cumulativeForecast)}</td><td>{amount(d.cumulativeActual)}</td></tr>)}</tbody></table></div></details></section>
    <section className="card dashboard-purchases"><div className="panel-heading flex items-center justify-between gap-3"><h2 className="section-title">Recent supplier purchases</h2><Link href={`/orders?week=${monday}`} className="text-sm underline">View purchases</Link></div>{recentOrders.length ? <ul className="divide-y divide-stone-100">{recentOrders.map(order => <li className="flex justify-between gap-3 py-3 text-sm" key={order.id}><span>{order.supplier.name}<span className="block text-xs text-stone-500">Delivery {dayLabel(order.accountingDate.toISOString().slice(0,10))}</span></span><span className="tabular-nums">{amount(order.amountPence)}</span></li>)}</ul> : <p className="text-sm text-stone-500">No supplier purchases allocated to this week.</p>}</section></div>
    <p className="mt-5 text-xs text-stone-500">GBP · Net sales and purchases excluding VAT · Europe/London. This allowance is projected; it changes with recorded sales, stock estimates and purchasing.</p>
  </>;
}
