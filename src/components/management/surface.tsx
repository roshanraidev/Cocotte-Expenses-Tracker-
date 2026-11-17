'use client';
import {usePermission,useSuperUser} from '@/components/permission-provider';
import {useSyncExternalStore,useState} from 'react';
import Link from 'next/link';
import {Bell,ChevronRight,Moon,Search,Sun,ShieldCheck} from 'lucide-react';
import styles from './management.module.css';
let fallbackTheme:string|null=null;
function themeSnapshot(){
 try{return localStorage.getItem('cocotte-management-theme')??fallbackTheme??(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}
 catch{return fallbackTheme??'light';}
}
function subscribeTheme(listener:()=>void){
 const media=matchMedia('(prefers-color-scheme: dark)');
 window.addEventListener('storage',listener);window.addEventListener('cocotte-theme',listener);media.addEventListener('change',listener);
 return ()=>{window.removeEventListener('storage',listener);window.removeEventListener('cocotte-theme',listener);media.removeEventListener('change',listener);};
}
export function ManagementSurface({name,title,children,notifications=[],admin=true}:{name:string;title:string;children:React.ReactNode;notifications?:{label:string;detail:string}[];admin?:boolean}){
 const theme=useSyncExternalStore(subscribeTheme,themeSnapshot,()=> 'light'),[search,setSearch]=useState('');

 const superUser=useSuperUser(),userAccess=usePermission('users.view'),planningAccess=usePermission('settings.view'),supplierAccess=usePermission('suppliers.view'),purchaseAccess=usePermission('purchasing.view');
 const links=[{href:'/admin',name:'Administration'},{href:'/suppliers',name:'Supplier Management'},{href:'/orders',name:'Supplier Purchases'},{href:'/admin/users',name:'Restaurant accounts'},{href:'/admin/planning',name:'Weekly Planning'},{href:'/admin/integrations/zonal',name:'Zonal Connect'}].filter(l=>l.href==='/admin/users'?admin&&userAccess:l.href==='/admin/planning'?admin&&planningAccess:l.href==='/suppliers'?supplierAccess:l.href==='/orders'?purchaseAccess:superUser&&admin);
 return <div className={styles.surface} data-theme={theme}>
 <div className={styles.topbar}><span className={styles.breadcrumb}>Workspace <ChevronRight size={14}/><strong>{title}</strong></span><div className={styles.topActions}>
 <details className={styles.searchMenu}><summary aria-label="Search administration"><Search size={18}/><span>Search workspace</span><kbd>↵</kbd></summary><div className={styles.popover}><label>Find a page<input autoComplete="off" placeholder="Search pages…" value={search} onChange={e=>setSearch(e.target.value)}/></label>{links.filter(l=>l.name.toLowerCase().includes(search.toLowerCase())).map(l=><Link key={l.href} href={l.href}>{l.name}<ChevronRight size={14}/></Link>)}{!links.some(l=>l.name.toLowerCase().includes(search.toLowerCase()))&&<p>No matching pages.</p>}</div></details>
 <button className={styles.icon} aria-label={theme==='light'?'Switch to dark mode':'Switch to light mode'} onClick={()=>{const next=theme==='light'?'dark':'light';fallbackTheme=next;try{localStorage.setItem('cocotte-management-theme',next);}catch{/* The current session still supports theme changes. */}window.dispatchEvent(new Event('cocotte-theme'));}}>{theme==='light'?<Moon size={18}/>:<Sun size={18}/>}</button>
 <details className={styles.notifications}><summary className={styles.icon} aria-label="Recent activity notifications"><Bell size={18}/>{notifications.length>0&&<i/>}</summary><div className={styles.popover}><strong>Recent activity</strong><p>Latest recorded workspace events</p>{notifications.slice(0,4).map((n,i)=><div className={styles.notification} key={i}><b>{n.label}</b><small>{n.detail}</small></div>)}{!notifications.length&&<p>No recent activity recorded.</p>}<Link href="/admin#activity">View audit activity <ChevronRight size={14}/></Link></div></details>
 <div className={styles.profile}><span>{name.split(/\s+/).slice(0,2).map(n=>n[0]).join('')}</span><div><b>{name}</b><small><ShieldCheck size={11}/>{superUser&&admin?'Super User':'Staff member'}</small></div></div>
 </div></div>{children}</div>;
}
export {styles};
