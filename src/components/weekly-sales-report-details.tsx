import type {WeeklySalesOverview} from '@/lib/zonal/weekly-sales';
import {formatGBP} from '@/lib/money';
import {ZonalSalesBadge} from './zonal-sales-source';
const money=(v:bigint|null)=>v===null?'Not available':formatGBP(v);
const reportMoney=(v:string|undefined)=>v===undefined?'Not available':formatGBP(BigInt(v));
export function WeeklySalesReportDetails({data,admin}:{data:WeeklySalesOverview;admin:boolean}){
 return <section className="card mt-5" aria-labelledby="financial-sales-details">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="financial-sales-details" className="section-title mt-0!">Sales financial detail</h2><span className="badge">{data.recordedDays}/7 days recorded</span></div>
  <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-5">{[['Net food sales',money(data.food)],['Net drink sales',money(data.drink)],['Net specials sales',money(data.specials)],['Gross sales',money(data.gross)],['Discounts',money(data.discount)],['VAT',money(data.vat)],['Covers',data.covers?.toString()??'Not available'],['Transactions',data.transactions?.toString()??'Not available'],['Average net spend per cover',money(data.averageNetPerCover)]].map(([label,value])=><div key={label}><dt className="text-xs text-stone-600">{label}</dt><dd className="mt-2 text-lg font-semibold tabular-nums">{value}</dd></div>)}</dl>
  <p className="mt-5 text-xs leading-6 text-stone-600">Approved Daily Sales only. Zonal gross is after discounts: gross − VAT = net; discounts are not deducted again. Food, drink and specials are separate net departments. {data.detailComplete?'Verified breakdown available for every recorded day.':`Verified detail covers ${data.detailedDays}/${data.recordedDays} recorded days; incomplete totals remain unavailable.`}</p>
  <div className="mt-4 overflow-x-auto"><table className="data-table"><thead><tr>{['Date','Actual net','Food','Drink','Specials','Gross','Discounts','VAT','Covers','Transactions'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{data.days.map(day=><tr key={day.date}><td>{day.date}<ZonalSalesBadge source={day.source??undefined} amount={day.actual} admin={admin}/></td><td>{day.actual===null?'Not recorded':money(day.actual)}</td>{(['food','drink','specials','gross','discount','vat'] as const).map(key=><td key={key}>{reportMoney(day.report?.[key])}</td>)}<td>{day.report?.covers??'Not available'}</td><td>{day.report?.transactions??'Not available'}</td></tr>)}</tbody></table></div>
  <p className="mt-4 text-xs text-stone-500">Latest matching approved Zonal import: {data.latestApprovedAt?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(data.latestApprovedAt):'Not available'}</p>
 </section>;
}
