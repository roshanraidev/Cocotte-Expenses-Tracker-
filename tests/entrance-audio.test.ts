import {afterEach,describe,expect,it,vi} from 'vitest';
import {EntranceAudio,securitySirenSample,ENTRANCE_WARNING_PERIOD_MS} from '@/lib/entrance-audio';
function fixture(state:AudioContextState='running'){
 const param=()=>({value:0,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn(),cancelScheduledValues:vi.fn(),setTargetAtTime:vi.fn()});
 const oscillators:{frequency:ReturnType<typeof param>;start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>}[]=[],buffers:{start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;loop?:boolean}[]=[];
 const connect=vi.fn(),master={gain:param(),connect};
 const context={state,currentTime:1,sampleRate:8000,destination:{},resume:vi.fn().mockResolvedValue(undefined),close:vi.fn().mockResolvedValue(undefined),
  createGain:vi.fn(()=>({gain:param(),connect})),createDynamicsCompressor:vi.fn(()=>({threshold:param(),knee:param(),ratio:param(),connect})),
  createOscillator:vi.fn(()=>{const node={frequency:param(),type:'sine',connect,start:vi.fn(),stop:vi.fn(),disconnect:vi.fn(),onended:null};oscillators.push(node);return node;}),
  createBuffer:vi.fn((_channels:number,length:number)=>({getChannelData:()=>new Float32Array(length)})),
  createBufferSource:vi.fn(()=>{const node={connect,start:vi.fn(),stop:vi.fn(),disconnect:vi.fn(),onended:null,buffer:null};buffers.push(node);return node;}),
  createBiquadFilter:vi.fn(()=>({type:'bandpass',frequency:param(),Q:param(),connect})),
 };
 context.createGain.mockReturnValueOnce(master);
 const factory=vi.fn(()=>context as unknown as AudioContext),audio=new EntranceAudio(factory);
 return {audio,context,factory,oscillators,buffers,master};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('optional cinematic foley',()=>{
 it('starts muted and creates no audio context before a permitted user gesture',()=>{const {audio,factory}=fixture();audio.unlock();audio.play('rejected');audio.play('accepted');expect(factory).not.toHaveBeenCalled();});
 it('uses a continuous emergency siren loop with bounded output instead of notification tones',()=>{const {audio,oscillators,buffers,master,context}=fixture();audio.setMuted(false);audio.unlock();audio.startWarning();expect(oscillators).toHaveLength(0);expect(buffers).toHaveLength(1);expect(buffers[0].loop).toBe(true);expect(buffers[0].start).toHaveBeenCalledWith(1);expect(context.createBuffer).toHaveBeenCalledWith(1,9600,8000);expect(master.gain.value).toBe(.18);expect(ENTRANCE_WARNING_PERIOD_MS).toBe(1200);for(let i=0;i<9600;i++)expect(Math.abs(securitySirenSample(i/8000))).toBeLessThanOrEqual(.2);expect(securitySirenSample(0)).toBeCloseTo(securitySirenSample(1.2),10);});
 it('renders one chime plus bounded brass, wood and mist cues without loops',()=>{const {audio,oscillators,buffers}=fixture();audio.setMuted(false);audio.unlock();audio.play('accepted');expect(oscillators).toHaveLength(3);for(const cue of ['unlock','opening','entering'] as const)audio.play(cue);expect(buffers).toHaveLength(6);expect([...oscillators,...buffers].every(source=>source.start.mock.calls.length===1&&source.stop.mock.calls.length>=1)).toBe(true);});
 it('mutes immediately and suppresses future scheduled cues',()=>{const {audio,context,oscillators}=fixture();audio.setMuted(false);audio.unlock();audio.play('accepted');audio.setMuted(true);expect(oscillators.every(source=>source.stop.mock.calls.length>=2)).toBe(true);audio.play('opening');expect(context.createBufferSource).not.toHaveBeenCalled();});
 it('silently tolerates unsupported audio, blocked resume and device errors',async()=>{const broken=new EntranceAudio(()=>{throw new Error('device failure');});broken.setMuted(false);expect(()=>broken.unlock()).not.toThrow();expect(()=>broken.play('accepted')).not.toThrow();const {audio,context}=fixture('suspended');context.resume.mockRejectedValue(new Error('blocked'));audio.setMuted(false);audio.unlock();await Promise.resolve();expect(()=>audio.play('opening')).not.toThrow();expect(context.createOscillator).not.toHaveBeenCalled();});
 it('stops voices and releases resources on skip/unmount without waiting',()=>{vi.useFakeTimers();const {audio,context}=fixture();audio.setMuted(false);audio.unlock();audio.play('entering');expect(()=>audio.dispose()).not.toThrow();vi.runAllTimers();expect(context.close).toHaveBeenCalledOnce();});
 it('repeats on the audio clock without timers and stops the loop on retry/edit',()=>{vi.useFakeTimers();const {audio,buffers}=fixture();audio.setMuted(false);audio.unlock();audio.startWarning();expect(buffers[0].loop).toBe(true);expect(vi.getTimerCount()).toBe(0);audio.startWarning();expect(buffers[0].stop).toHaveBeenCalled();expect(buffers).toHaveLength(2);audio.stopWarning();expect(buffers[1].stop).toHaveBeenCalled();vi.advanceTimersByTime(10000);expect(buffers).toHaveLength(2);});
 it('clears repeating warnings on mute, successful authentication and disposal',()=>{vi.useFakeTimers();for(const action of ['mute','accepted','dispose'] as const){const {audio}=fixture();audio.setMuted(false);audio.unlock();audio.startWarning();if(action==='mute')audio.setMuted(true);else if(action==='accepted')audio.play('accepted');else audio.dispose();vi.advanceTimersByTime(50);expect(vi.getTimerCount()).toBe(0);}});
});
