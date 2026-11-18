import Link from 'next/link';
import type {WeeklySalesOverview as Overview} from '@/lib/zonal/weekly-sales';
import {formatGBP} from '@/lib/money';
import {ratioLabel} from '@/lib/finance';
import {dayLabel} from '@/lib/dates';
import {ZonalSalesBadge} from './zonal-sales-source';
const money=(value:bigint|null)=>value===null?'Not available':formatGBP(value);
export function WeeklySalesOverview({data,admin,salesView=true,reportsView=true,children}:{data:Overview;admin:boolean;salesView?:boolean;reportsView?:boolean;children?:React.ReactNode}){
 const max=data.days.reduce((top,day)=>[day.actual??0n,day.originalForecast??0n,top].reduce((a,b)=>a>b?a:b),1n);
 const height=(value:bigint)=>`${Number(value*10000n/max)/100}%`;
 return <section className="operational-sales" aria-labelledby="weekly-sales-overview" data-weekly-sales-overview>
  <header className="operational-section-heading"><h2 id="weekly-sales-overview">Weekly sales</h2><span className="badge">{data.weekComplete?'Complete week':'Partial week'} · {data.recordedDays}/7 days recorded</span></header>
  <div className="operational-sales-metrics">{[{label:'Actual net sales',value:data.recordedDays?data.actualNet:null,key:'net'},{label:'Net food sales',value:data.food,key:'food'},{label:'Net drink sales',value:data.drink,key:'drink'},{label:'Net specials sales',value:data.specials,key:'specials'}].map(({label,value,key})=><div key={key}><p>{label}</p><strong data-sales-kpi={key}>{key==='net'&&!data.recordedDays?'Not recorded':money(value)}</strong>{key==='net'&&<small>{data.recordedDays} of 7 days recorded · actuals only</small>}</div>)}</div>
  {!data.detailComplete&&data.recordedDays>0&&<p className="operational-note">Department detail is available for {data.detailedDays}/{data.recordedDays} recorded days. Missing breakdowns remain unavailable; manual net sales are included.</p>}
  <div className="operational-performance-heading"><h3>Forecast vs actual</h3><p>{data.variance===null?'Awaiting comparable recorded sales':`${money(data.variance)} variance${data.varianceBps===null?'':` · ${ratioLabel(data.varianceBps)}`} · recorded days`}</p></div>
  <figure className="operational-week-chart" aria-label="Weekly forecast versus recorded actual sales"><figcaption><span>Original forecast</span><span>Recorded actual</span></figcaption><div className="operational-week-bars">{data.days.map(day=><div className="operational-week-day" key={day.date} title={`${day.date} · forecast ${money(day.originalForecast)} · actual ${day.actual===null?'Not recorded':money(day.actual)}`}><div className="operational-bar-track">{day.originalForecast!==null&&<span className="operational-bar-forecast" style={{height:height(day.originalForecast)}}/>}{day.actual!==null?<span className="operational-bar-actual" data-recorded-actual={day.actual.toString()} style={{height:height(day.actual)}}/>:<span className="operational-bar-missing" aria-label={`${day.date}: Not recorded`}>—</span>}</div><span>{dayLabel(day.date).slice(0,3)}</span></div>)}</div></figure>
  {children}
  <details className="operational-daily"><summary>Daily breakdown</summary><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Date</th><th>Forecast</th><th>Actual net</th><th>Variance</th></tr></thead><tbody>{data.days.map(day=><tr key={day.date}><td>{salesView?<Link href={'/sales?date='+day.date}>{dayLabel(day.date)}</Link>:dayLabel(day.date)}<ZonalSalesBadge source={day.source??undefined} amount={day.actual} admin={admin}/></td><td>{money(day.originalForecast)}</td><td>{day.actual===null?'Not recorded':money(day.actual)}</td><td>{money(day.variance)}</td></tr>)}</tbody></table></div></details>
  {reportsView&&<Link className="operational-text-link operational-report-link" href={`/reports?week=${data.monday}&tab=sales`}>Detailed sales report →</Link>}
 </section>;
}
