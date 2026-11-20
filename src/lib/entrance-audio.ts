/** Small, optional Web Audio foley layer. No samples, network requests or credentials.
 * Every public method fails silently: audio must never gate authentication/navigation. */
export type EntranceCue='rejected'|'accepted'|'unlock'|'opening'|'entering';
export const ENTRANCE_WARNING_PERIOD_MS=1200;
/** Phase-continuous emergency wail: 600 → 1400 → 600 Hz, with restrained horn harmonics. */
export function securitySirenSample(time:number){
 const period=ENTRANCE_WARNING_PERIOD_MS/1000;
 const phase=2*Math.PI*1000*time-400*period*Math.sin(2*Math.PI*time/period);
 return .2*(Math.sin(phase)+.25*Math.sin(3*phase)+.08*Math.sin(5*phase))/1.33;
}
type AudioFactory=()=>AudioContext;
export class EntranceAudio{
 private context:AudioContext|null=null;
 private master:GainNode|null=null;
 private muted=true;
 private alarm:AudioBufferSourceNode|null=null;
 private sources=new Set<AudioScheduledSourceNode>();
 constructor(private factory:AudioFactory=()=>{
  const Context=window.AudioContext??(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  if(!Context)throw new Error('Audio unavailable');return new Context();
 }){}
 /** Call only from an explicit pointer/keyboard gesture; never on mount/autoplay. */
 unlock(){
  if(this.muted)return;
  try{
   if(this.context?.state==='closed'){this.context=null;this.master=null;}
   if(!this.context){
    const ctx=this.factory();this.context=ctx;const master=ctx.createGain(),limiter=ctx.createDynamicsCompressor();
    master.gain.value=.18;limiter.threshold.value=-24;limiter.knee.value=12;limiter.ratio.value=12;
    master.connect(limiter);limiter.connect(ctx.destination);this.context=ctx;this.master=master;
   }
   if(this.context.state!=='running')void this.context.resume().catch(()=>{});
  }catch{this.dispose();/* Browser policy, device failure or unavailable Web Audio: remain silent. */}
 }
 setMuted(muted:boolean){this.muted=muted;if(muted)this.silence();}
 stopWarning(){if(this.alarm){try{this.alarm.stop((this.context?.currentTime??0)+.025);}catch{}this.alarm=null;}this.silenceVoices();}
 startWarning(){
  this.stopWarning();
  if(this.muted||!this.context||this.context.state!=='running')return;
  try{
   const ctx=this.context,buffer=ctx.createBuffer(1,Math.round(ctx.sampleRate*ENTRANCE_WARNING_PERIOD_MS/1000),ctx.sampleRate),samples=buffer.getChannelData(0);
   for(let i=0;i<samples.length;i++)samples[i]=securitySirenSample(i/ctx.sampleRate);
   const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
   source.connect(this.master!);this.track(source);this.alarm=source;
   this.master!.gain.cancelScheduledValues(ctx.currentTime);this.master!.gain.setTargetAtTime(.18,ctx.currentTime,.01);
   source.start(ctx.currentTime);
  }catch{this.stopWarning();}

 }
 silence(){this.stopWarning();}
 private silenceVoices(){
  try{const ctx=this.context;if(this.master&&ctx){this.master.gain.cancelScheduledValues(ctx.currentTime);this.master.gain.setTargetAtTime(0,ctx.currentTime,.005);}for(const source of this.sources){try{source.stop((ctx?.currentTime??0)+.025);}catch{}}}catch{}
 }
 dispose(){
  this.muted=true;this.silence();const ctx=this.context;this.context=null;this.master=null;
  this.sources.clear();
  if(ctx)setTimeout(()=>{try{void ctx.close().catch(()=>{});}catch{}},35);
 }
 play(cue:EntranceCue){
  if(cue==='rejected'){this.startWarning();return;}
  try{
   const ctx=this.context,master=this.master;if(this.muted||!ctx||!master||ctx.state!=='running')return;
   if(cue==='accepted')this.stopWarning();
   const time=ctx.currentTime+.03;
   master.gain.cancelScheduledValues(ctx.currentTime);master.gain.setTargetAtTime(.18,ctx.currentTime,.01);
   if(cue==='accepted'){
    // One warm, lightly inharmonic confirmation chime, not a melody.
    this.tone(659.25,time,.55,.14);this.tone(1319,time,.36,.035);this.tone(1975,time,.2,.014);
   }else if(cue==='unlock'){
    // Brief brass contact and damped latch resonance.
    this.noise(time,.025,.17,1800,8);this.tone(2310,time,.055,.04);this.tone(3670,time,.035,.018);
    this.noise(time+.065,.04,.07,440,2);
   }else if(cue==='opening'){
    // Friction grains and drifting wood resonances: restrained, irregular creak.
    this.noise(time,.85,.08,520,5);
    this.tone(146,time,.28,.065,91);this.tone(223,time+.19,.39,.035,167);this.tone(122,time+.53,.31,.045,76);
    this.noise(time+.2,.12,.065,920,7);this.noise(time+.55,.17,.04,350,4);
   }else{
    this.noise(time,.78,.09,850,.7,true);
   }
  }catch{/* Optional effect: do not surface raw browser/device errors or reject sign-in. */}
 }
 private track(source:AudioScheduledSourceNode){
  this.sources.add(source);source.onended=()=>{this.sources.delete(source);try{source.disconnect();}catch{}};
 }
 private tone(frequency:number,time:number,duration:number,volume:number,endFrequency=frequency){
  const ctx=this.context!,source=ctx.createOscillator(),gain=ctx.createGain();source.type='sine';
  source.frequency.setValueAtTime(frequency,time);source.frequency.exponentialRampToValueAtTime(endFrequency,time+duration);
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.008);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
  source.connect(gain);gain.connect(this.master!);this.track(source);source.start(time);source.stop(time+duration+.015);
 }
 private noise(time:number,duration:number,volume:number,frequency:number,q:number,air=false){
  const ctx=this.context!,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),samples=buffer.getChannelData(0);
  // Colored impulse/friction excitation; the band-pass removes harsh broadband hiss.
  for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(air?1:Math.exp(-i/samples.length*2));
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.setValueAtTime(frequency,time);filter.Q.value=q;
  if(air){filter.frequency.linearRampToValueAtTime(1250,time+duration*.4);filter.frequency.exponentialRampToValueAtTime(320,time+duration);}
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+(air ? .17 : .004));gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
  source.connect(filter);filter.connect(gain);gain.connect(this.master!);this.track(source);source.start(time);source.stop(time+duration+.015);
 }
}
