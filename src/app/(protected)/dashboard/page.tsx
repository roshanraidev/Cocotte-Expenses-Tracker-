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
import { LiveRefresh } from '@/components/live-refresh';
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const user = await requireUser();
  const today = londonToday();
  const monday = selectedWeek((await searchParams).week, today);
  const data = await financialWeek(user.restaurantId, monday, today);
  const { days, sales, finance, target } = data;
  const recentOrders = await db().supplierOrder.findMany({where:{restaurantId:user.restaurantId,expectedDeliveryDate:{gte:dateValue(monday),lte:dateValue(addDays(monday,6))}},include:{supplier:true,invoice:true},orderBy:{createdAt:'desc'},take:5});
  const amount = (value: bigint | null | undefined) => value == null ? '—' : formatGBP(value);
  const available = finance?.allowance;
  const breakdown = [
    ['Updated projected weekly net sales', amount(sales?.projectedPence)],
    ['Weekly food cost target', percentLabel(target.targetBps)],
    ['Maximum weekly purchasing budget', amount(finance?.purchasingBudget)],
    ['Confirmed purchases', amount(data.purchases)],
    ['Outstanding supplier orders', amount(data.commitments)],
    ['Remaining available to spend', amount(available)],
  ];
  return <><LiveRefresh/><p className="eyebrow">Cocotte · Kitchen intelligence</p><h1 className="page-title">Dashboard</h1>
    <WeekNavigation monday={monday} path="/dashboard" current={mondayOf(today)}/>
    <section className="allowance-hero" aria-labelledby="allowance-heading">
      <h2 id="allowance-heading" className="text-sm font-semibold tracking-[0.16em] text-[#e0d1a0]">WEEKLY AVAILABLE TO SPEND</h2>
      <div className="my-5 font-semibold tracking-tight" style={{fontSize: available == null ? 'clamp(1.7rem,4vw,3rem)' : 'clamp(2.4rem,7vw,5.5rem)', lineHeight:1.12, overflowWrap:'anywhere'}}>
        {available == null ? "Set up this week's plan" : <MoneyValue pence={available.toString()}/>}
      </div>
      <p className="text-sm text-white/75">Projected purchasing allowance · Mon–Sun</p>
      {available != null && available < 0n && <p role="status" className="mt-4 rounded-lg border border-[#e0d1a0]/50 p-3 text-sm text-[#fff0c1]">Over budget: purchases and commitments exceed the projected allowance by {formatGBP(-available)}.</p>}
      {available == null && <p className="mt-4 text-sm text-white/85">A seven-day forecast, opening stock and expected closing stock are required. {user.role === 'SUPER_USER' ? <Link className="underline" href={`/admin/planning?week=${monday}`}>Set up weekly planning →</Link> : 'Ask your Super User to complete weekly planning.'}</p>}
      <dl className="mt-7 grid gap-x-8 gap-y-3 border-t border-white/15 pt-5 text-sm sm:grid-cols-2 lg:grid-cols-3">{breakdown.map(([label,value]) => <div key={label}><dt className="text-xs text-white/65">{label}</dt><dd className="mt-1 font-medium tabular-nums">{value}</dd></div>)}</dl>
    </section>
    <div className="my-5 flex flex-wrap gap-3"><Link className="btn" href="/sales">ENTER TODAY&apos;S SALES</Link><Link className="btn btn-secondary" href={`/orders?week=${monday}`}>REGISTER SUPPLIER ORDER</Link></div>
    <section className="card mt-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="section-title">Weekly Sales Performance</h2><Link className="text-sm underline" href={`/reports?week=${monday}&tab=sales`}>View detailed sales report</Link></div>
      <div className="overflow-x-auto"><table className="data-table compact-sales"><thead><tr><th>Day</th><th>Forecast</th><th>Actual</th><th>Variance</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><td><abbr className="no-underline" title={dayLabel(day.date)}>{dayLabel(day.date).slice(0,3)}</abbr></td><td>{amount(day.originalPence)}</td><td>{amount(day.actualPence)}</td><td className={day.actualPence == null ? '' : day.actualPence >= day.originalPence ? 'text-[#285440]' : 'text-amber-800'}>{day.actualPence == null ? '—' : amount(day.actualPence - day.originalPence)}</td></tr>)}</tbody></table></div>
      {!days.length && <p className="py-4 text-sm text-stone-500">No forecast has been entered for this week.</p>}
      <p className="mt-4 text-xs text-stone-500">{sales?.recordedDays ?? 0}/7 actual sales days recorded. Unrecorded days retain their original forecast.</p>
    </section>
    <section className="card mt-6"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="section-title">Recent supplier orders</h2><Link href={`/orders?week=${monday}`} className="text-sm underline">View orders</Link></div>{recentOrders.length ? <ul className="divide-y divide-stone-100">{recentOrders.map(order => <li className="flex justify-between gap-3 py-3 text-sm" key={order.id}><span>{order.supplier.name}<span className="block text-xs text-stone-500">{order.status.charAt(0)+order.status.slice(1).toLowerCase()} · Delivery {dayLabel(order.expectedDeliveryDate.toISOString().slice(0,10))}</span></span><span className="tabular-nums">{amount(order.invoice?.amountPence ?? order.estimatedAmountPence)}</span></li>)}</ul> : <p className="text-sm text-stone-500">No supplier orders allocated to this week.</p>}</section>
    <p className="mt-5 text-xs text-stone-500">GBP · Net sales and purchases excluding VAT · Europe/London. This allowance is projected; it changes with recorded sales, stock estimates and purchasing.</p>
  </>;
}
