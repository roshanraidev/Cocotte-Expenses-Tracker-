import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {reportFilters} from '@/lib/packaging/reporting';
import {packagingReport} from '@/lib/packaging/data';
import {PackagingFilters,PackagingSummary,ProductSpending,SupplierSpending} from '@/components/packaging-report';
import {PrintReport} from '@/components/report-chart';
import {LiveRefresh} from '@/components/live-refresh';
export default async function Reports({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){const user=await requireUser();let filters;try{filters=reportFilters(await searchParams);}catch(e){return <div className="card"><p role="alert">{(e as Error).message}</p><Link href="/packaging/reports">Reset filters</Link></div>;}const report=await packagingReport(user.restaurantId,filters);const query=new URLSearchParams({...filters,week:filters.start,month:filters.start.slice(0,7)}).toString();return <><LiveRefresh/><header className="flex flex-wrap justify-between gap-3"><div><p className="eyebrow">Packaging & Chemicals</p><h1 className="page-title">Purchasing reports</h1><p className="text-sm text-stone-500">{filters.start} – {filters.end} · Confirmed invoices · Excluding VAT</p></div><div className="print:hidden"><PrintReport/></div></header><PackagingFilters restaurantId={user.restaurantId} filters={filters}/><PackagingSummary report={report}/><div className="mt-4 grid gap-4"><ProductSpending report={report} query={query}/><SupplierSpending report={report}/></div></>;}
