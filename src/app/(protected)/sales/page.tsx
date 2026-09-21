import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { dayLabel, londonToday, mondayOf } from '@/lib/dates';
import { loadWeek, selectedWeek } from '@/lib/week-data';
import { formatGBP, poundsInput } from '@/lib/money';
import { SalesForm } from '@/components/sales-form';
import { WeekNavigation } from '@/components/week-navigation';
export default async function Sales({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const user = await requireUser();
  const today = londonToday();
  const monday = selectedWeek((await searchParams).week, today);
  const { week, days } = await loadWeek(user.restaurantId, monday);
  const admin = user.role === 'SUPER_USER';
  return <><h1 className="mb-6 text-3xl font-semibold">Daily sales</h1><WeekNavigation monday={monday} path="/sales" current={mondayOf(today)}/>{!week ? <section className="card"><p>A Super User must create this week’s forecast before sales can be entered.</p>{admin && <Link className="btn mt-4" href={`/admin/forecasts?week=${monday}`}>Create forecast</Link>}</section> : <><p className="mb-6 text-sm text-stone-600">Chefs can record missing sales in the current week. Super Users can correct saved sales and enter historical sales with a reason.</p><div className="grid gap-5 md:grid-cols-2">{days.map(({ date, sale, forecast }) => <section className="card" key={date}><h2 className="mb-3 font-semibold">{dayLabel(date)}</h2><p className="mb-3 text-sm">Forecast: {forecast ? formatGBP(forecast.forecastPence) : 'Missing'} · Actual: {sale ? formatGBP(sale.amountPence) : 'Not recorded'}</p>{!week.finalizedAt && date <= today && (admin || (!sale && monday === mondayOf(today))) ? <SalesForm date={date} version={sale?.version ?? 0} amount={sale ? poundsInput(sale.amountPence) : ''} reasonRequired={!!sale || monday !== mondayOf(today)}/> : <p className="text-sm text-stone-500">{week.finalizedAt ? 'This week is finalized.' : date > today ? 'Future sales cannot be recorded.' : sale ? 'Contact a Super User for corrections.' : 'Historical entry requires a Super User.'}</p>}</section>)}</div></>}</>;
}
