'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {DndContext,closestCenter,KeyboardSensor,MouseSensor,TouchSensor,useSensor,useSensors,type DragEndEvent} from '@dnd-kit/core';
import {SortableContext,arrayMove,rectSortingStrategy,sortableKeyboardCoordinates,useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {mergeVisibleRecipeOrder} from '@/lib/recipe-library-preferences';
import {saveLibraryOrder} from './preference-actions';
type Item={id:string;name:string;card:ReactNode};
function SortableCard({item,reduced,disabled}:{item:Item;reduced:boolean;disabled:boolean}){
 const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging,isOver}=useSortable({id:item.id,disabled});
 const accepts=(target:EventTarget|null)=>target instanceof Element&&!target.closest('.recipe-entry-actions,button,input,select,textarea,[data-no-recipe-drag]');
 return <div ref={node=>{setNodeRef(node);setActivatorNodeRef(node);}} role="group" tabIndex={disabled?-1:0} aria-label={'Reorder '+item.name} aria-roledescription="sortable recipe" aria-describedby={attributes['aria-describedby']} aria-disabled={disabled||undefined} data-dragging={isDragging||undefined}
  onMouseDown={event=>{if(accepts(event.target))listeners?.onMouseDown?.(event);}}
  onTouchStart={event=>{if(accepts(event.target))listeners?.onTouchStart?.(event);}}
  onKeyDown={event=>{if(event.target===event.currentTarget)listeners?.onKeyDown?.(event);}}
  onDragStartCapture={event=>{if(accepts(event.target))event.preventDefault();}}
  onContextMenuCapture={event=>{if(accepts(event.target)&&(isDragging||matchMedia('(pointer: coarse)').matches))event.preventDefault();}}
  className={'recipe-sortable'+(isDragging?' is-dragging':'')+(isOver&&!isDragging?' is-drop-target':'')} style={{transform:CSS.Transform.toString(transform),transition:reduced?'none':transition,zIndex:isDragging?5:undefined}}>
  {item.card}
 </div>;
}
/** Always-on personal sorting. Shared defaults remain the fallback until a user drags. */
export default function LibraryOrder({items,fullOrder,revision}:{items:Item[];fullOrder:string[];revision:number}){
 const router=useRouter(),[visible,setVisible]=useState(items.map(item=>item.id)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[reduced,setReduced]=useState(true);
 const version=useRef(revision),full=useRef(fullOrder),unsaved=useRef(false),pending=useRef<Promise<boolean>|null>(null),mounted=useRef(true),dragActive=useRef(false),suppressClickUntil=useRef(0);
 const sensors=useSensors(useSensor(MouseSensor,{activationConstraint:{distance:6}}),useSensor(TouchSensor,{activationConstraint:{delay:350,tolerance:8}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 async function persist(next:string[]):Promise<boolean>{
  if(pending.current)return pending.current;
  setBusy(true);setError('');setStatus('Saving order…');unsaved.current=true;
  const task=(async()=>{try{
   const result=await saveLibraryOrder({scope:'personal',ids:next,revision:version.current});
   if(result.error){if(mounted.current){setError(result.error);setStatus('Order not saved');}return false;}
   version.current=result.revision!;full.current=next;unsaved.current=false;
   if(mounted.current)setStatus('Order saved');return true;
  }catch{if(mounted.current){setError('Could not save the order. Retry, or reload to check the saved arrangement.');setStatus('Order not saved');}return false;}})();
  pending.current=task;const saved=await task;pending.current=null;if(mounted.current)setBusy(false);return saved;
 }
 useEffect(()=>{
  mounted.current=true;
  const ready=()=>pending.current??Promise.resolve(!unsaved.current);
  const beforeNavigation=(event:Event)=>(event as CustomEvent<{waitUntil:(promise:Promise<boolean>)=>void}>).detail.waitUntil(ready());
  const protect=(event:BeforeUnloadEvent)=>{if(unsaved.current)event.preventDefault();};
  const navigate=async(event:MouseEvent)=>{
   const anchor=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
   if(!anchor||!unsaved.current||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||anchor.target==='_blank')return;
   const target=new URL(anchor.href);if(target.origin!==location.origin)return;
   event.preventDefault();event.stopImmediatePropagation();if(await ready())router.push(target.pathname+target.search+target.hash);
  };
  const suppressDragClick=(event:MouseEvent)=>{if((dragActive.current||Date.now()<suppressClickUntil.current)&&(event.target as Element).closest('.recipe-sortable')){event.preventDefault();event.stopImmediatePropagation();}};
  window.addEventListener('click',suppressDragClick,true);
  document.addEventListener('recipe-order-before-navigation',beforeNavigation);document.addEventListener('click',navigate,true);window.addEventListener('beforeunload',protect);
  return()=>{window.removeEventListener('click',suppressDragClick,true);mounted.current=false;document.removeEventListener('recipe-order-before-navigation',beforeNavigation);document.removeEventListener('click',navigate,true);window.removeEventListener('beforeunload',protect);};
 },[router]);
 async function dropped(event:DragEndEvent){
  if(busy||unsaved.current||!event.over||event.active.id===event.over.id)return;
  const from=visible.indexOf(String(event.active.id)),to=visible.indexOf(String(event.over.id));if(from<0||to<0)return;
  const next=arrayMove(visible,from,to);setVisible(next);full.current=mergeVisibleRecipeOrder(full.current,next);await persist(full.current);
 }
 const byId=new Map(items.map(item=>[item.id,item]));
 return <><DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={()=>{dragActive.current=true;}} onDragEnd={event=>{dragActive.current=false;suppressClickUntil.current=Date.now()+350;void dropped(event);}} onDragCancel={()=>{dragActive.current=false;suppressClickUntil.current=Date.now()+350;}} accessibility={{screenReaderInstructions:{draggable:'Click and hold a card, or long-press on touch, to drag. For keyboard sorting, focus the recipe group, press Space, use arrow keys, and press Space to drop and save automatically. Escape cancels dragging.'}}}><SortableContext items={visible} strategy={rectSortingStrategy}><section className="recipe-grid" aria-label="Recipe library">{visible.map(id=>{const item=byId.get(id);return item?<SortableCard key={id} item={item} reduced={reduced} disabled={busy||!!error}/>:null;})}</section></SortableContext></DndContext><p className="recipe-order-status" role="status" aria-live="polite">{status}</p>{error&&<div className="recipe-preference-error" role="alert">{error} <button type="button" disabled={busy} onClick={()=>void persist(full.current)}>Retry</button><button type="button" onClick={()=>{if(confirm('Reload the saved order? Your unsaved arrangement will be discarded.'))location.reload();}}>Reload order</button></div>}</>;
}
