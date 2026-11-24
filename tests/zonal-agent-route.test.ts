import {beforeEach,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/db',()=>({db:vi.fn(()=>({}))}));
vi.mock('@/lib/zonal/agent/receiver',()=>({receiveAgentReport:vi.fn()}));
import {receiveAgentReport} from '@/lib/zonal/agent/receiver';
import {db} from '@/lib/db';
import {POST} from '@/app/api/zonal/agent/sales/route';
const token='a'.repeat(43);
beforeEach(()=>{
 vi.clearAllMocks();vi.unstubAllEnvs();
 for(const [key,value] of Object.entries({ZONAL_AGENT_ID:'fixture-agent',ZONAL_AGENT_TOKEN_SHA256:createHash('sha256').update(token).digest('hex'),ZONAL_AGENT_RESTAURANT_ID:'restaurant',ZONAL_AGENT_ACTOR_ID:'admin',ZONAL_AGENT_RECEIVER_ORIGIN:'https://mrcocotte.com'}))vi.stubEnv(key,value);
});
it('denies browser sessions and never opens the database for missing machine authentication',async()=>{
 const result=await POST(new Request('https://mrcocotte.com/api/zonal/agent/sales',{method:'POST',headers:{Cookie:'staff-session=anything','Content-Type':'application/json'},body:'{}'}));expect(result.status).toBe(401);expect(db).not.toHaveBeenCalled();
});
it('returns only a sanitized acknowledgement and never approves from the endpoint',async()=>{
 vi.mocked(receiveAgentReport).mockResolvedValue({transferId:'123e4567-e89b-42d3-a456-426614174000',status:'STAGED',previewId:'preview'});
 const result=await POST(new Request('https://mrcocotte.com/api/zonal/agent/sales',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'}));expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toBe('no-store');expect((await result.json()).status).toBe('STAGED');
});
it('never returns raw database exceptions or secrets',async()=>{
 vi.mocked(receiveAgentReport).mockRejectedValue(new Error('private database connection and credentials'));
 const result=await POST(new Request('https://mrcocotte.com/api/zonal/agent/sales',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'}));expect(result.status).toBe(503);expect(await result.text()).not.toContain('private');
});
