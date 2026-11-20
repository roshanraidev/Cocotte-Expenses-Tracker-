'use client';
import {useActionState,useEffect,useRef,useState,type CSSProperties} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight,Eye,EyeOff,LockKeyhole,Mail,LoaderCircle} from 'lucide-react';
import {cinematicLogin} from '@/app/login/actions';
import {entranceStage,ENTRANCE_TIMING,type EntranceResult,type EntranceStage} from '@/lib/login-entrance';
import {EntranceAudio,ENTRANCE_WARNING_PERIOD_MS} from '@/lib/entrance-audio';
const initial:EntranceResult={error:'',outcome:'idle'};
export function LoginForm(){
 const router=useRouter(),scene=useRef<HTMLElement>(null),form=useRef<HTMLFormElement>(null),navigating=useRef(false),audio=useRef<EntranceAudio|null>(null);
 const [warningStopped,setWarningStopped]=useState(false);
 const warningAllowed=useRef(false);
 const [email,setEmail]=useState(''),[dirty,setDirty]=useState(false),[visible,setVisible]=useState(false),[phase,setPhase]=useState<EntranceStage>('accepted');
 const [result,action,pending]=useActionState(async(previous:EntranceResult,data:FormData)=>{
  setDirty(false);setWarningStopped(false);warningAllowed.current=true;audio.current?.stopWarning();
  try{return await cinematicLogin(previous,data);}catch{return {error:'The entrance is temporarily unavailable. Please try again.',outcome:'unavailable' as const};}
 },initial);
 const accepted=result.outcome==='accepted'&&!!result.destination,stage=warningStopped&&!dirty&&!pending&&result.outcome==='rejected'?'idle':entranceStage(pending,result,dirty,phase);
 function armSound(){
  if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  audio.current??=new EntranceAudio();audio.current.setMuted(false);audio.current.unlock();
 }
 useEffect(()=>()=>audio.current?.dispose(),[]);
 useEffect(()=>{
  const stop=()=>{warningAllowed.current=false;audio.current?.silence();setWarningStopped(true);};
  const hidden=()=>{if(document.hidden)stop();};
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>{if(motion.matches)stop();};motion.addEventListener('change',reduced);
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);
  return()=>{motion.removeEventListener('change',reduced);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);};
 },[]);
 useEffect(()=>{
  if(result.outcome==='rejected'&&!dirty&&!pending&&!warningStopped&&warningAllowed.current&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   // Reset visual cycles alongside the audio-buffer loop, avoiding timer drift.
   scene.current?.getAnimations({subtree:true}).filter(animation=>['warning-lamp','handle-rejected','door-security-shake'].includes((animation as CSSAnimation).animationName)).forEach(animation=>{animation.currentTime=0;});
   audio.current?.startWarning();
  }
  else audio.current?.stopWarning();
  return()=>audio.current?.stopWarning();
 },[result,dirty,pending,warningStopped]);
 useEffect(()=>{
  if(!accepted||!result.destination)return;
  audio.current?.play('accepted');
  router.prefetch(result.destination);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lock=setTimeout(()=>{if(!navigating.current)audio.current?.play('unlock');},100);
  const timers=reduced?[setTimeout(()=>{if(!navigating.current){navigating.current=true;audio.current?.silence();router.replace(result.destination!);}},100)]:[
   setTimeout(()=>{if(!navigating.current){setPhase('opening');audio.current?.play('opening');}},ENTRANCE_TIMING.unlock),
   setTimeout(()=>{if(!navigating.current){setPhase('entering');audio.current?.play('entering');}},ENTRANCE_TIMING.open),
   setTimeout(()=>{if(!navigating.current){navigating.current=true;audio.current?.silence();router.replace(result.destination!);}},ENTRANCE_TIMING.finish),
  ];return()=>{clearTimeout(lock);timers.forEach(clearTimeout);};
 },[accepted,result.destination,router]);
 useEffect(()=>{
  const viewport=window.visualViewport;let frame=0;
  const keepVisible=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   if(form.current?.contains(document.activeElement)&&viewport&&viewport.height<600)form.current.scrollIntoView({block:'center',behavior:'instant'});
  });};
  viewport?.addEventListener('resize',keepVisible);return()=>{cancelAnimationFrame(frame);viewport?.removeEventListener('resize',keepVisible);};
 },[]);
 const message=pending?'Checking your staff access…':accepted?'Access confirmed. Welcome to Cocotte.':!dirty?(result.outcome==='rejected'?'ACCESS DENIED — Incorrect email or password.':result.error):'';
 return <main ref={scene} className="cinematic-login" style={{'--warning-period':`${ENTRANCE_WARNING_PERIOD_MS}ms`} as CSSProperties} data-stage={stage} onPointerDownCapture={armSound} onKeyDownCapture={armSound} onPointerMove={event=>{
  if(event.pointerType!=='mouse'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  scene.current?.style.setProperty('--brass-shift',`${((event.clientX/innerWidth)-.5)*6}px`);
 }}>
  <div className="entrance-atmosphere" aria-hidden="true"/>
  <div className="entrance-scene">
   {/* Both surfaces share one optimized photograph; the door is a separate perspective layer. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img className="entrance-facade" src="/login/cocotte-entrance-forest.webp" alt="" width={1672} height={941} fetchPriority="high" decoding="async" aria-hidden="true"/>
   <div className="lantern-bloom" aria-hidden="true"/>
   <div className="door-assembly">
    <div className="restaurant-interior" aria-hidden="true"><div className="interior-corridor"/></div>
    <div className="door-leaf">
     <div className="door-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="door-texture" src="/login/cocotte-entrance-forest.webp" alt="" width={1672} height={941} aria-hidden="true"/>
      <header className="door-plaque" aria-label="COCOTTE · KITCHEN INTELLIGENCE"><h1>Cocotte</h1><p>Kitchen Intelligence</p></header>
      <form ref={form} action={action} className="door-login-form" onInput={()=>{if(!accepted){warningAllowed.current=false;audio.current?.stopWarning();setDirty(true);}}} aria-label="Staff sign in" aria-busy={pending}>
       <div className="door-form-heading"><p className="door-form-caption">Behind every great kitchen.</p><p className="door-form-support">Smarter decisions start here.</p></div>
       <fieldset disabled={pending||accepted}>
        <legend className="entrance-sr-only">Sign in with your staff account</legend>
        <label className="door-input"><Mail size={17} aria-hidden="true"/><span className="entrance-sr-only">Email address</span><input id="email" name="email" type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="Email address" aria-describedby={message?'entrance-feedback':undefined}/></label>
        <div className="door-input"><LockKeyhole size={17} aria-hidden="true"/><label htmlFor="password" className="entrance-sr-only">Password</label><input id="password" name="password" type={visible?'text':'password'} autoComplete="current-password" required maxLength={128} placeholder="Password" aria-describedby={message?'entrance-feedback':undefined}/><button type="button" className="password-visibility" onClick={()=>setVisible(v=>!v)} aria-label={visible?'Hide password':'Show password'} aria-pressed={visible}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
        <button className="enter-cocotte" type="submit" aria-label="Enter Cocotte — Sign in to your kitchen">{pending?<><LoaderCircle size={16} className="entrance-spinner"/>Checking access</>:accepted?'Welcome inside':<>Enter Cocotte<ArrowRight size={19} aria-hidden="true"/></>}</button>
       </fieldset>
       <p id="entrance-feedback" className="entrance-feedback" role={result.error&&!dirty&&!pending?'alert':'status'} aria-live="polite">{message||'Private entrance · Authorised staff only'}</p>
      </form>
      <div className="door-hardware" aria-hidden="true"><span className="hardware-screw"/><span className="brass-lever"/><span className="glowing-keyhole"/><span className="hardware-screw hardware-screw-bottom"/></div>
     </div>
     <div className="door-reverse" aria-hidden="true"/>
    </div>
   </div>
   <div className="door-status-light" aria-hidden="true"/><div className="door-lamp-spill" aria-hidden="true"/>
  </div>
  <div className="entrance-vignette" aria-hidden="true"/>
  <div className="entrance-mist" aria-hidden="true"/>
  <footer className="entrance-footer"><span>COCOTTE · KITCHEN INTELLIGENCE</span><span>Need access? Contact your administrator.</span></footer>

 </main>;
}
