'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useKitchen} from './realtime';
import {categories,type Choices} from '@/lib/kitchen/types';
async function post(url:string,value:unknown){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});if(!response.ok)throw new Error('Unable to save. Please try again.');}
export function NotificationCentre({admin}:{admin:boolean}){
 const data=useKitchen(),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[draft,setDraft]=useState<{inApp:Choices;push:Choices}|null>(null);
 const choices=draft??data.preferences;
 async function run(action:()=>Promise<void>){setError('');setStatus('');setBusy(true);try{await action();setStatus('Saved.');}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false);}}
 async function preferences(inApp:Choices,push:Choices){setDraft({inApp,push});try{await post('/api/kitchen/notifications',{operation:'preferences',inApp,push});await data.reload();setDraft(null);}catch(error){setDraft(null);throw error;}}
 async function enablePush(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!data.pushKey)throw new Error('Browser push is unavailable. On iPhone, use an installed Home Screen app.');
  if(await Notification.requestPermission()!=='granted')throw new Error('Notification permission was not granted.');
  const worker=await navigator.serviceWorker.register('/kitchen-sw.js');await navigator.serviceWorker.ready;
  const bytes=Uint8Array.from(atob(data.pushKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const subscription=await worker.pushManager.getSubscription()??await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  await post('/api/kitchen/push',{operation:'enable',subscription:subscription.toJSON()});
 }
 return <div className="kitchen-centre"><header><p className="eyebrow">Your kitchen, connected</p><h1 className="page-title">Notifications</h1><p>Recipe changes, Weekly Specials and important kitchen updates.</p></header>
 {data.available===false&&<p role="status" className="kitchen-feedback">Notifications and real-time updates are awaiting the reviewed kitchen database migration. No database update has been applied.</p>}{error&&<p role="alert" className="kitchen-feedback">{error}</p>}{status&&<p role="status">{status}</p>}
 <section aria-label="Kitchen updates" className="kitchen-notices">{data.notifications.length?data.notifications.map(n=><article key={n.id} className={n.read?'':'is-unread'}><Link prefetch={false} href={'/notifications/open/'+encodeURIComponent(n.id)}><strong>{n.action}</strong><span>{n.name}</span><time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}</time></Link><button disabled={busy||!data.available} onClick={()=>run(()=>post('/api/kitchen/notifications',{operation:'read',id:n.id,read:!n.read}))}>{n.read?'Mark unread':'Mark read'}</button></article>):<p className="card" role="status">{data.available===null?'Connecting to kitchen updates…':'No kitchen updates to show.'}</p>}</section>
 <details className="card"><summary>Notification preferences</summary><p>Choose what appears here and what is sent to your browser.</p><table className="data-table"><thead><tr><th>Updates</th><th>In-app</th><th>Push</th></tr></thead><tbody>{Object.entries(categories).map(([category,label])=><tr key={category}><th>{label}</th>{(['inApp','push'] as const).map(channel=><td key={channel}><input type="checkbox" aria-label={`${label} ${channel}`} checked={choices[channel][category as keyof Choices]!==false} disabled={busy||!data.available} onChange={e=>run(()=>preferences(channel==='inApp'?{...choices.inApp,[category]:e.target.checked}:choices.inApp,channel==='push'?{...choices.push,[category]:e.target.checked}:choices.push))}/></td>)}</tr>)}</tbody></table>
 <button className="btn" disabled={busy||!data.pushKey} onClick={()=>run(data.preferences.pushEnabled?async()=>{await post('/api/kitchen/push',{operation:'disable'});const registration=await navigator.serviceWorker?.getRegistration('/');await (await registration?.pushManager.getSubscription())?.unsubscribe();}:enablePush)}>{data.preferences.pushEnabled?'Disable browser notifications':'Enable browser notifications'}</button>{!data.pushKey&&<p>Browser push needs server VAPID keys, an encryption key and the notification worker. In-app notifications work independently.</p>}</details>
 {admin&&<details className="card"><summary>Publish kitchen announcement</summary><form onSubmit={e=>{e.preventDefault();const form=e.currentTarget,values=new FormData(form);void run(async()=>{await post('/api/kitchen/notifications',{operation:'announcement',title:values.get('title'),body:values.get('body'),published:true});form.reset();});}}><label>Title<input name="title" required maxLength={150}/></label><label>Announcement<textarea name="body" required maxLength={4000}/></label><button disabled={busy||!data.available} className="btn">Publish announcement</button></form></details>}
 </div>;
}
