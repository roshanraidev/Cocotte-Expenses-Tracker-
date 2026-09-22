'use client';
import Link from 'next/link';
import {useActionState,useId,useState} from 'react';
import {activePurchaseSuppliers,savePurchase} from '@/app/(protected)/orders/actions';
export function PurchaseForm({suppliers:initialSuppliers,today,submissionKey}:{suppliers:{id:string;name:string}[];today:string;submissionKey:string}) {
  const id=useId();
  const base=JSON.stringify(initialSuppliers);
  const [refresh,setRefresh]=useState<{base:string;rows:typeof initialSuppliers}|null>(null);
  const suppliers=refresh?.base===base?refresh.rows:initialSuppliers;
  const [values,setValues]=useState({supplierId:'',orderDate:today,deliveryDate:today,amount:''});
  const [refreshError,setRefreshError]=useState('');
  const [state,action,pending]=useActionState(async(previous:Awaited<ReturnType<typeof savePurchase>>,form:FormData)=>{
    const result=await savePurchase(previous,form);
    if(result.success)setValues({supplierId:'',orderDate:String(form.get('orderDate')),deliveryDate:String(form.get('deliveryDate')),amount:''});
    return result;
  },{error:'',success:'',submissionKey,savedWeek:''});
  return <form action={action} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <input type="hidden" name="submissionKey" value={state.submissionKey}/>
    <div><label htmlFor={`${id}-supplier`}>Supplier name</label><select id={`${id}-supplier`} name="supplierId" value={values.supplierId} required disabled={pending} onChange={e=>setValues({...values,supplierId:e.target.value})} onFocus={()=>{void activePurchaseSuppliers().then(rows=>{setRefresh({base,rows});setRefreshError('');}).catch(()=>setRefreshError('Could not refresh suppliers. Reload this page to try again.'));}}><option value="" disabled>Select supplier…</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
    <div><label htmlFor={`${id}-order`}>Order date</label><input id={`${id}-order`} name="orderDate" type="date" value={values.orderDate} max={today} onChange={e=>setValues({...values,orderDate:e.target.value})} required readOnly={pending}/></div>
    <div><label htmlFor={`${id}-delivery`}>Delivery date</label><input id={`${id}-delivery`} name="deliveryDate" type="date" value={values.deliveryDate} min={values.orderDate} onChange={e=>setValues({...values,deliveryDate:e.target.value})} required readOnly={pending}/></div>
    <div><label htmlFor={`${id}-amount`}>Total amount EXCLUDING VAT (£)</label><input id={`${id}-amount`} name="amount" inputMode="decimal" value={values.amount} onChange={e=>setValues({...values,amount:e.target.value})} pattern="[0-9]+([.][0-9]{1,2})?" maxLength={15} placeholder="0.00" required readOnly={pending}/></div>
    <div className="sm:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-3"><button className="btn" disabled={pending}>{pending?'Saving…':'Save Purchase'}</button><p className="text-xs text-stone-500">Saved as confirmed. Uses your net amount directly and the delivery week.</p></div>
    {(state.error||refreshError)&&<p role="alert" className="notice sm:col-span-2 xl:col-span-4">{state.error||refreshError}</p>}
    {state.success&&<p role="status" className="save-success text-sm text-[#285440] sm:col-span-2 xl:col-span-4">{state.success} <Link className="underline" href={`/orders?week=${state.savedWeek}`}>View delivery week</Link></p>}
  </form>;
}
