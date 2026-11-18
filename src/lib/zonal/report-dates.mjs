// Observed Financial Detail date labels. Ignore placeholders and malformed dates.
export function availableReportDates(labels,latestCompleted){
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 return [...new Set(labels.flatMap(text=>{
  const m=text.trim().match(/^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})\s+\([A-Za-z]{3}\)$/);if(!m)return[];
  const month=months.indexOf(m[2])+1;if(!month)return[];
  const key=`${m[3]}-${String(month).padStart(2,'0')}-${m[1]}`;
  const date=new Date(`${key}T00:00:00Z`);
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===key&&key<=latestCompleted?[key]:[];
 }))].sort();
}

/** Observed report options only; never request another week or fill missing dates with zero. */
export function weeklyAvailability(requested,offered){
 const first=requested[0],last=requested.at(-1);
 const latest=offered.filter(date=>date>=first&&date<=last).sort().at(-1)??null;
 return {latest,fetch:requested.filter(date=>latest!==null&&date<=latest),unavailable:requested.filter(date=>latest===null||date>latest)};
}
