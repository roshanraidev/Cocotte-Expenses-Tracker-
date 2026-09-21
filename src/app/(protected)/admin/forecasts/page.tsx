import { requireAdmin } from '@/lib/auth';
import { londonToday, mondayOf } from '@/lib/dates';
import { loadWeek, selectedWeek } from '@/lib/week-data';
import { poundsInput } from '@/lib/money';
import { ForecastForm } from '@/components/forecast-form';
import { WeekNavigation } from '@/components/week-navigation';
export default async function Forecasts({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const user = await requireAdmin();
  const today = londonToday();
  const monday = selectedWeek((await searchParams).week, today);
  const { week, days } = await loadWeek(user.restaurantId, monday);
  return <><h1 className="mb-6 text-3xl font-semibold">Weekly forecasts</h1><WeekNavigation monday={monday} path="/admin/forecasts" current={mondayOf(today)}/><section className="card">{week?.finalizedAt ? <p>This week is finalized and cannot be edited.</p> : <ForecastForm key={monday} monday={monday} version={week?.version ?? 0} amounts={days.map(day => day.forecast ? poundsInput(day.forecast.forecastPence) : '')}/>}</section></>;
}
