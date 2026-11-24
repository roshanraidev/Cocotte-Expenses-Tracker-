import {beforeEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({user:vi.fn(),cards:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth',()=>({currentUser:mock.user}));
vi.mock('@/lib/db',()=>({db:()=>({})}));
vi.mock('@/lib/weekly-specials-service',()=>({publishedSpecialCards:mock.cards}));
import {GET} from '@/app/api/recipes/weekly-specials/route';
beforeEach(()=>{vi.clearAllMocks();mock.user.mockResolvedValue({id:'viewer',restaurantId:'owned-restaurant',role:'CHEF',permissions:['recipes.view']});mock.cards.mockResolvedValue([]);});
describe('uncached weekly-specials feed',()=>{
 it('rejects unauthenticated and unauthorized requests before querying specials',async()=>{mock.user.mockResolvedValueOnce(null);expect((await GET()).status).toBe(401);mock.user.mockResolvedValueOnce({role:'CHEF',permissions:[]});expect((await GET()).status).toBe(403);expect(mock.cards).not.toHaveBeenCalled();});
 it('scopes the feed to the authenticated restaurant and disables caching',async()=>{const response=await GET();expect(mock.cards).toHaveBeenCalledWith({},'owned-restaurant');expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.get('vary')).toBe('Cookie');expect(await response.json()).toEqual({specials:[]});});
 it('returns a fresh snapshot on every request without reusing stale published rows',async()=>{mock.cards.mockResolvedValueOnce([{id:'published'}]).mockResolvedValueOnce([]);expect((await (await GET()).json()).specials).toHaveLength(1);expect((await (await GET()).json()).specials).toEqual([]);expect(mock.cards).toHaveBeenCalledTimes(2);});
 it('fails safely without including internal errors or stale data',async()=>{mock.cards.mockRejectedValue(new Error('private database diagnostic'));const response=await GET();expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('private database');expect(response.headers.get('cache-control')).toContain('no-store');});
});
