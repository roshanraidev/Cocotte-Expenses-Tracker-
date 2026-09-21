'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { formatGBP } from '@/lib/money';
function subscribe(callback:()=>void) { const media=window.matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',callback);return ()=>media.removeEventListener('change',callback); }
export function useReducedMotion() { return useSyncExternalStore(subscribe,()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,()=>true); }
export function MoneyValue({ pence }: { pence: string }) {
  const [display,setDisplay]=useState(pence);const previous=useRef(pence);const reduced=useReducedMotion();
  useEffect(()=>{
    const from=BigInt(previous.current),to=BigInt(pence);previous.current=pence;
    if(reduced) return;
    if(from===to) { const frame=requestAnimationFrame(()=>setDisplay(pence));return ()=>cancelAnimationFrame(frame); }
    const start=performance.now();let frame=0;
    const tick=()=>{const elapsed=Math.min(220,Math.floor(performance.now()-start));setDisplay((from+(to-from)*BigInt(elapsed)/220n).toString());if(elapsed<220)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(frame);
  },[pence,reduced]);
  return <span aria-label={formatGBP(BigInt(pence))}>{formatGBP(BigInt(reduced?pence:display))}</span>;
}
