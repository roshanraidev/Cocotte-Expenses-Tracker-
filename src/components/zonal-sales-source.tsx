import Link from 'next/link';
import type { ZonalSalesSource } from '@/lib/zonal/sales-source';
export function ZonalSalesBadge({source,amount,admin=false}:{source?:ZonalSalesSource;amount:bigint|null|undefined;admin?:boolean}){
 if(!source||source.netPence!==amount)return null;
 const approved=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(source.approvedAt);
 const compact=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(source.approvedAt);
 const label=`Zonal report ${source.reportDate} · ${source.branch} · approved ${approved}${source.method==='ZONAL_MANUAL'?' · manually entered report':''}`;
 return <span className="mt-1 block" data-sales-source="Zonal" title={label}><span className="badge !py-0.5 !text-[9px]">{admin?<Link href={`/admin/integrations/zonal#history-${source.importId}`} aria-label={label}>Zonal</Link>:<span aria-label={label}>Zonal</span>}</span><span className="mt-1 block text-[9px] font-normal text-stone-500">Approved</span><time className="block text-[10px] font-normal text-stone-500" dateTime={source.approvedAt.toISOString()} aria-label={`Approved ${approved}`}>{compact}</time></span>;
}
