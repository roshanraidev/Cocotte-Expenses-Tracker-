'use client';
import Link from 'next/link';
import {KitchenRealtime} from './kitchen/realtime';
import {NotificationBell} from './kitchen/bell';
import './kitchen/kitchen.css';
import {usePathname} from 'next/navigation';
import {useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {ChefHat,PanelLeftClose,PanelLeftOpen,UserRound,X} from 'lucide-react';
import {Navigation,navigationIcons} from './navigation';
import {WorkspaceSwitcher} from './workspace-switcher';
import {mobileDestinations,navigationActive,navigationItems,type AccessibleWorkspace} from '@/lib/navigation';
import type {Permission} from '@/lib/permissions';
const preference='cocotte.sidebar.collapsed';
function snapshot(){try{return localStorage.getItem(preference)==='true';}catch{return false;}}
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener('cocotte-sidebar',callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener('cocotte-sidebar',callback);};}
export function ApplicationShell({children,brand,account,admin,permissions,workspaces}:{children:ReactNode;brand:ReactNode;account:ReactNode;admin:boolean;permissions:Permission[];workspaces:AccessibleWorkspace[]}){
 const path=usePathname(),collapsed=useSyncExternalStore(subscribe,snapshot,()=>false),sheet=useRef<HTMLDialogElement>(null),more=useRef<HTMLButtonElement>(null),content=useRef<HTMLDivElement>(null),shell=useRef<HTMLDivElement>(null),accountMenu=useRef<HTMLDetailsElement>(null);
 const [pageContext,setPageContext]=useState({title:'',detail:''});
 const links=navigationItems({role:admin?'SUPER_USER':'CHEF',permissions},path),shortcuts=mobileDestinations(links);
 const moreActive=!shortcuts.some(l=>navigationActive(l.href,path));
 const current=links.find(l=>navigationActive(l.href,path));
 const workspace=workspaces.find(w=>w.id===(path.startsWith('/packaging')?'packaging':'food'));
 useEffect(()=>{
  const container=content.current;if(!container)return;
  let heading:HTMLElement|null=null;
  function update(){
   const next=Array.from(container!.querySelectorAll<HTMLElement>('h1')).find(element=>element.getClientRects().length>0)??null;
   const recipeDetail=!!next?.closest('.recipe-identity');
   if(heading!==next){heading?.removeAttribute('data-shell-heading');heading=next;if(!recipeDetail)heading?.setAttribute('data-shell-heading','');}
   const title=recipeDetail?'Recipe details':next?.textContent?.trim()??'',detail=Array.from(container!.querySelectorAll('.week-toolbar p')).find(element=>element.getClientRects().length>0)?.textContent?.trim()??'';
   setPageContext(previous=>previous.title===title&&previous.detail===detail?previous:{title,detail});
  }
  update();const observer=new MutationObserver(update);observer.observe(container,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','style']});
  container.scrollTo({top:0,behavior:'instant'});
  return()=>{observer.disconnect();heading?.removeAttribute('data-shell-heading');};
 },[path]);
 useEffect(()=>{
  // CSS owns the layout. Only compensate when a keyboard overlays the visual viewport
  // (iOS); browsers that resize content naturally need no extra inset.
  const viewport=window.visualViewport;if(!viewport)return;
  let frame=0;
  function update(){
   cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
    const target=document.activeElement,editable=target instanceof HTMLElement&&target.matches('input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable=true]');
    const gap=editable&&matchMedia('(max-width:767px)').matches?Math.max(0,window.innerHeight-viewport!.height-viewport!.offsetTop):0;
    shell.current?.style.setProperty('--keyboard-inset',gap>100?`${Math.round(gap)}px`:'0px');
    if(editable&&matchMedia('(max-width:767px)').matches){
     const field=target!.getBoundingClientRect(),area=content.current?.getBoundingClientRect();
     if(area&&(field.top<area.top+64||field.bottom>area.bottom-24))target!.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    }
   });
  }
  viewport.addEventListener('resize',update);viewport.addEventListener('scroll',update);document.addEventListener('focusin',update);document.addEventListener('focusout',update);
  return()=>{cancelAnimationFrame(frame);viewport.removeEventListener('resize',update);viewport.removeEventListener('scroll',update);document.removeEventListener('focusin',update);document.removeEventListener('focusout',update);};
 },[]);

 useEffect(()=>{sheet.current?.close();accountMenu.current?.removeAttribute('open');},[path]);
 useEffect(()=>{
  function outside(event:PointerEvent){if(event.target instanceof Node&&!accountMenu.current?.contains(event.target))accountMenu.current?.removeAttribute('open');}
  function escape(event:KeyboardEvent){if(event.key==='Escape'&&accountMenu.current?.open){accountMenu.current.removeAttribute('open');accountMenu.current.querySelector('summary')?.focus();}}
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[]);
 useEffect(()=>{const query=matchMedia('(min-width:768px)');const close=()=>{if(query.matches)sheet.current?.close();};query.addEventListener('change',close);return()=>query.removeEventListener('change',close);},[]);
 function toggle(){try{localStorage.setItem(preference,String(!collapsed));window.dispatchEvent(new Event('cocotte-sidebar'));}catch{/* Storage may be unavailable in private browsing. */}}
 const nav=<Navigation admin={admin} permissions={permissions}/>;
 return <KitchenRealtime enabled={permissions.includes('recipes.view')}><div ref={shell} className={`app-shell adaptive-shell ${collapsed?'is-collapsed':''}`}>
  <a href="#main-content" className="shell-skip">Skip to content</a>
  <header className="application-header" aria-label="Application header">
   <Link className="mobile-identity" href={shortcuts.find(l=>l.label==='Home')?.href??links[0]?.href??'/access-denied'} aria-label="Cocotte home"><span className="mobile-chef"><ChefHat size={25} strokeWidth={1.5}/></span><span>Cocotte<small>Kitchen intelligence</small></span></Link>
   <div className="application-page-context"><p title={pageContext.title||current?.label||'Cocotte'}>{pageContext.title||current?.label||'Cocotte'}</p><small>{pageContext.detail||workspace?.label||'Kitchen intelligence'}</small></div>
   <div className="application-header-actions">{permissions.includes('recipes.view')&&<NotificationBell/>}<WorkspaceSwitcher workspaces={workspaces}/><details ref={accountMenu} className="header-account"><summary aria-label="Account menu"><UserRound size={19}/><span>Account</span></summary><div className="header-account-panel">{account}</div></details></div>
  </header>
  <aside className="sidebar desktop-sidebar" aria-label="Application sidebar">
   <div className="shell-brand">{brand}</div>
   <button className="shell-toggle" onClick={toggle} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="desktop-navigation" title={collapsed?'Expand sidebar':'Collapse sidebar'}>{collapsed?<PanelLeftOpen size={20}/>:<PanelLeftClose size={20}/>}</button>
   <div id="desktop-navigation" className="shell-navigation">{nav}</div>
   {account}
  </aside>
  <div ref={content} className="shell-content"><main id="main-content" className="workspace" tabIndex={-1}>{children}</main></div>
  <nav className="mobile-bottom" aria-label="Mobile navigation" style={{gridTemplateColumns:`repeat(${shortcuts.length+1},minmax(0,1fr))`}}>
   {shortcuts.map(({href,label,icon})=>{const Icon=navigationIcons[icon];return <Link key={href} href={href} aria-current={navigationActive(href,path)?'page':undefined}><Icon size={21}/><span>{label}</span></Link>;})}
   <button ref={more} onClick={()=>sheet.current?.showModal()} aria-label="More navigation" aria-haspopup="dialog" aria-controls="mobile-more" className={moreActive?'more-active':''}><ChefHat size={23}/><span>More</span></button>
  </nav>
  <dialog ref={sheet} id="mobile-more" className="navigation-sheet" aria-labelledby="more-heading" onClose={()=>more.current?.focus({preventScroll:true})} onClick={e=>{if(e.target===e.currentTarget)sheet.current?.close();}}>
   <div className="sheet-heading"><h2 id="more-heading">More from Cocotte</h2><button autoFocus className="shell-toggle" aria-label="Close navigation" onClick={()=>sheet.current?.close()}><X size={22}/></button></div>
   <div className="sheet-body" onClick={e=>{if((e.target as HTMLElement).closest('a'))sheet.current?.close();}}>{nav}<WorkspaceSwitcher workspaces={workspaces}/>{account}</div>
  </dialog>
 </div></KitchenRealtime>;
}
