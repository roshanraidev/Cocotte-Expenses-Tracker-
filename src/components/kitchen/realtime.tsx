'use client';
import {createContext,useContext,useEffect,useState,useCallback,type ReactNode} from 'react';
import {emptyKitchen,type KitchenSnapshot} from '@/lib/kitchen/types';
const Context=createContext<KitchenSnapshot&{reload:()=>Promise<void>}>({...emptyKitchen,reload:async()=>{}});
export function KitchenRealtime({enabled,children}:{enabled:boolean;children:ReactNode}){
 const [snapshot,setSnapshot]=useState(emptyKitchen);
 const reload=useCallback(async()=>{const response=await fetch('/api/kitchen/notifications',{cache:'no-store'});if(!response.ok)throw new Error('Unable to refresh notifications.');setSnapshot(await response.json());},[]);
 useEffect(()=>{if(!enabled)return;const events=new EventSource('/api/kitchen/events');
 events.onmessage=message=>{try{setSnapshot(JSON.parse(message.data));}catch{setSnapshot(emptyKitchen);}};
 events.addEventListener('unavailable',()=>setSnapshot(emptyKitchen));events.onerror=()=>setSnapshot(emptyKitchen);
 return()=>events.close();},[enabled]);
 return <Context.Provider value={{...snapshot,reload}}>{children}</Context.Provider>;
}
export const useKitchen=()=>useContext(Context);
