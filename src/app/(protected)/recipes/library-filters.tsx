'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {Search} from 'lucide-react';
import {emptyLibraryFilters,libraryUrl,waitForRecipeOrder,type LibraryFilters} from '@/lib/recipe-library-preferences';
import {saveLibraryFilters} from './preference-actions';
export default function LibraryFilters({initial,saved,revision,types,archived,available=true}:{initial:LibraryFilters;saved:LibraryFilters;revision:number;types:{id:string;name:string}[];archived:boolean;available?:boolean}){
 const router=useRouter(),[filters,setFilters]=useState(initial),[error,setError]=useState(''),[status,setStatus]=useState(''),version=useRef(revision),latest=useRef(initial),lastSaved=useRef(JSON.stringify(saved)),inflight=useRef<Promise<boolean>|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true);
 const navigation=useSearchParams().toString();
 const [previousInitial,setPreviousInitial]=useState(initial),[writtenRevision,setWrittenRevision]=useState(revision),[previousNavigation,setPreviousNavigation]=useState(navigation);
 const syncedNavigation=useRef(navigation);
 // Adjust controlled state on real URL navigation; search updates keep their DOM focus.
 if(previousNavigation!==navigation){setPreviousNavigation(navigation);setPreviousInitial(initial);setFilters(initial);}
 else if(revision>writtenRevision&&JSON.stringify(previousInitial)!==JSON.stringify(initial)){setPreviousInitial(initial);if(JSON.stringify(filters)===JSON.stringify(previousInitial))setFilters(initial);}
 function dirty(){return JSON.stringify(latest.current)!==lastSaved.current;}
 async function persist():Promise<boolean>{
  if(timer.current)clearTimeout(timer.current);
  if(inflight.current){if(!await inflight.current)return false;return persist();}
  if(!dirty())return true;
  const snapshot=latest.current;setStatus('Saving filters…');setError('');
  const task=(async()=>{try{const result=await saveLibraryFilters(snapshot,version.current);if(result.error){if(mounted.current){setError(result.error);setStatus('Filters not saved');}return false;}version.current=result.revision;if(mounted.current)setWrittenRevision(result.revision);lastSaved.current=JSON.stringify(snapshot);if(mounted.current)setStatus(dirty()?'Saving filters…':'Filters saved');return true;}catch{if(mounted.current){setError('Filters could not be saved. Retry before leaving to keep your changes.');setStatus('Filters not saved');}return false;}})();
  inflight.current=task;const success=await task;inflight.current=null;return success;
 }
 async function flush(){while(dirty()){if(!await persist())return false;}return true;}
 async function apply(){if(await flush()&&await waitForRecipeOrder())router.replace(libraryUrl(latest.current),{scroll:false});}
 function change(next:LibraryFilters,search=false){latest.current=next;setFilters(next);setStatus('Saving filters…');setError('');if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void apply(),search?500:0);}
 useEffect(()=>{
  if(!available)return;
  const navigated=syncedNavigation.current!==navigation;syncedNavigation.current=navigation;
  // Server Actions may return an old URL snapshot: only real navigation or a newer revision can replace input.
  if(!navigated&&revision<=version.current)return;
  if(!dirty()){latest.current=initial;lastSaved.current=JSON.stringify(saved);version.current=revision;if(dirty())void persist();}
 // Sync explicit tab/back navigation without remounting the search input.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[initial.q,initial.type,initial.tab,initial.sort,revision,navigation]);
 useEffect(()=>{
  if(!available)return;
  mounted.current=true;
  // Explicit URL filters (including archive tabs) are saved as well as form changes.
  if(dirty())void persist();
  const navigate=async(event:MouseEvent)=>{const anchor=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');if(!anchor||!dirty()||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||anchor.target==='_blank')return;const target=new URL(anchor.href);if(target.origin!==location.origin||!target.pathname.startsWith('/recipes'))return;event.preventDefault();event.stopImmediatePropagation();if(await flush()&&await waitForRecipeOrder())router.push(target.pathname+target.search+target.hash);};
  const requestFlush=(event:Event)=>(event as CustomEvent<{waitUntil:(promise:Promise<boolean>)=>void}>).detail.waitUntil(flush());
  document.addEventListener('recipe-library-flush',requestFlush);
  const unload=(event:BeforeUnloadEvent)=>{if(dirty()){event.preventDefault();}};
  const hidden=()=>{if(document.hidden&&dirty())void persist();};
  document.addEventListener('click',navigate,true);window.addEventListener('beforeunload',unload);document.addEventListener('visibilitychange',hidden);
  return()=>{document.removeEventListener('recipe-library-flush',requestFlush);mounted.current=false;if(timer.current)clearTimeout(timer.current);document.removeEventListener('click',navigate,true);window.removeEventListener('beforeunload',unload);document.removeEventListener('visibilitychange',hidden);};
 // The event listeners last only for the mounted library controls.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 if(!available)return <form id="recipe-library-filters" className="recipe-filters" role="search" aria-label="Recipe library search and filters"><input type="hidden" name="tab" value={initial.tab}/><label className="recipe-search"><Search size={16}/><input name="q" defaultValue={initial.q} placeholder="Search recipes" aria-label="Search recipes" maxLength={200}/></label><select name="type" defaultValue={initial.type} aria-label="Recipe type"><option value="">All categories</option>{types.map(type=><option key={type.id} value={type.id}>{type.name}</option>)}</select>{archived&&<select name="sort" defaultValue={initial.sort} aria-label="Sort archived recipes"><option value="recent">Recently archived</option><option value="oldest">Oldest archived</option><option value="name">Name A–Z</option><option value="name-desc">Name Z–A</option></select>}<button className="btn btn-secondary">FILTER</button></form>;
 return <><form id="recipe-library-filters" className={'recipe-filters'+(archived?' recipe-archive-filters':'')} role="search" aria-label="Recipe library search and filters" onSubmit={event=>{event.preventDefault();void apply();}}><label className="recipe-search"><Search size={16}/><input name="q" value={filters.q} onChange={event=>change({...filters,q:event.target.value},true)} maxLength={200} placeholder="Search recipes" aria-label="Search recipes"/></label><select name="type" value={filters.type} onChange={event=>change({...filters,type:event.target.value})} aria-label="Recipe type"><option value="">All categories</option>{types.map(type=><option key={type.id} value={type.id}>{type.name}</option>)}</select>{archived&&<select value={filters.sort} onChange={event=>change({...filters,sort:event.target.value as LibraryFilters['sort']})} aria-label="Sort archived recipes"><option value="recent">Recently archived</option><option value="oldest">Oldest archived</option><option value="name">Name A–Z</option><option value="name-desc">Name Z–A</option></select>}<div className="recipe-filter-actions"><button className="btn btn-secondary">FILTER</button><button className="recipe-preference-link" type="button" onClick={()=>change({...emptyLibraryFilters})}>Clear filters</button></div></form><div className="recipe-filter-save" aria-live="polite">{status}</div>{error&&<div className="recipe-preference-error" role="alert">{error} <button type="button" onClick={()=>void apply()}>Retry saving</button> <button type="button" onClick={()=>{latest.current=JSON.parse(lastSaved.current) as LibraryFilters;setFilters(latest.current);setError('');router.replace('/recipes');router.refresh();}}>Reload saved filters</button></div>}</>;
}
