import {describe,it,expect,vi,beforeEach} from 'vitest';
import {entranceStage,ENTRANCE_TIMING,type EntranceResult} from '@/lib/login-entrance';
const mocks=vi.hoisted(()=>({find:vi.fn(),throttle:vi.fn(),verify:vi.fn(),session:vi.fn(),audit:vi.fn(),update:vi.fn(),access:vi.fn(),redirect:vi.fn((path:string)=>{throw new Error('REDIRECT:'+path);})}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/db',()=>({db:()=>({user:{findUnique:mocks.find,update:mocks.update},$queryRaw:mocks.throttle,auditLog:{create:mocks.audit}})}));
vi.mock('@/lib/password',()=>({hashPassword:async()=> 'dummy-hash',verifyPassword:mocks.verify}));
vi.mock('@/lib/auth',()=>({startSession:mocks.session,endSession:vi.fn()}));
vi.mock('@/lib/access',()=>({resolveAccess:mocks.access}));
vi.mock('next/navigation',()=>({redirect:mocks.redirect}));
import {cinematicLogin,login} from '@/app/login/actions';
const initial:EntranceResult={error:'',outcome:'idle'};
function form(){const data=new FormData();data.set('email','staff@example.test');data.set('password','fixture-password');return data;}
beforeEach(()=>{vi.clearAllMocks();mocks.throttle.mockResolvedValue([{attempts:1}]);mocks.find.mockResolvedValue({id:'staff',restaurantId:'restaurant',active:true,passwordHash:'hash',role:'CHEF'});mocks.verify.mockResolvedValue(true);mocks.access.mockResolvedValue({role:'CHEF',permissions:['recipes.view']});});
describe('cinematic sign-in preserves server authentication',()=>{
 it('opens only after verification/session/audit and uses the permitted destination',async()=>{const result=await cinematicLogin(initial,form());expect(result).toEqual({error:'',outcome:'accepted',destination:'/recipes'});expect(mocks.session).toHaveBeenCalledWith('staff');expect(mocks.audit).toHaveBeenCalledOnce();expect(mocks.redirect).not.toHaveBeenCalled();expect(result).not.toHaveProperty('password');});
 it('keeps the old immediate redirect action working',async()=>{await expect(login({error:''},form())).rejects.toThrow('REDIRECT:/recipes');});
 it('rejects wrong, nonexistent and inactive accounts without a session or green state',async()=>{for(const user of [null,{id:'staff',active:false,passwordHash:'hash'}]){mocks.find.mockResolvedValue(user);expect((await cinematicLogin(initial,form())).outcome).toBe('rejected');}mocks.find.mockResolvedValue({id:'staff',active:true,passwordHash:'hash'});mocks.verify.mockResolvedValue(false);expect((await cinematicLogin(initial,form())).outcome).toBe('rejected');expect(mocks.session).not.toHaveBeenCalled();});
 it('keeps invalid input and throttling separate from a credential rejection',async()=>{expect((await cinematicLogin(initial,new FormData())).outcome).toBe('invalid');mocks.throttle.mockResolvedValue([{attempts:100}]);expect((await cinematicLogin(initial,form())).outcome).toBe('limited');expect(mocks.session).not.toHaveBeenCalled();});
 it('does not trust a success or destination sent in previous client state',async()=>{mocks.verify.mockResolvedValue(false);expect((await cinematicLogin({error:'',outcome:'accepted',destination:'/admin'},form())).outcome).toBe('rejected');});
});
describe('entrance states',()=>{
 it('never opens for pending, limited, unavailable or rejected results',()=>{expect(entranceStage(true,initial,true,'accepted')).toBe('authenticating');expect(entranceStage(false,{error:'wrong',outcome:'rejected'},false,'opening')).toBe('rejected');expect(entranceStage(false,{error:'busy',outcome:'limited'},false,'opening')).toBe('idle');expect(entranceStage(false,{error:'offline',outcome:'unavailable'},false,'opening')).toBe('idle');});
 it('allows immediate retry and bounds successful motion below three seconds',()=>{expect(entranceStage(false,{error:'wrong',outcome:'rejected'},true,'accepted')).toBe('typing');expect(ENTRANCE_TIMING.finish).toBeLessThanOrEqual(3000);expect(entranceStage(false,{error:'',outcome:'accepted',destination:'/recipes'},false,'opening')).toBe('opening');});
});
