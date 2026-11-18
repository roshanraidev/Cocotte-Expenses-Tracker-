import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({actor:{id:'admin',restaurantId:'restaurant',role:'SUPER_USER',permissions:['dashboard.view','sales.view']},guard:vi.fn(),enqueue:vi.fn(),control:vi.fn(),status:vi.fn(),review:vi.fn(),approve:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireAdmin:m.guard}));
vi.mock('@/lib/db',()=>({db:()=>({})}));
vi.mock('@/lib/sales-sync/jobs',()=>({enqueueSalesJob:m.enqueue,controlSalesJob:m.control,salesJobStatus:m.status,jobReview:m.review,requestBulkApproval:m.approve}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {dailySalesSync,approveDailyJob,controlDailyJob} from '@/app/(protected)/dashboard/sync-actions';
import {ZonalError} from '@/lib/zonal/validation';
beforeEach(()=>{vi.clearAllMocks();m.guard.mockResolvedValue(m.actor);m.enqueue.mockResolvedValue('job');});
describe('durable Dashboard sales actions',()=>{
 it('daily sync enqueues incremental work',async()=>{expect((await dailySalesSync()).jobId).toBe('job');expect(m.enqueue).toHaveBeenCalledWith({},m.actor,'DAILY');});
 it('reports offline worker setup accurately',async()=>{m.enqueue.mockRejectedValue(new ZonalError('Worker offline'));expect((await dailySalesSync()).error).toBe('Worker offline');});
 it('never exposes internal exception contents',async()=>{m.enqueue.mockRejectedValue(new Error('SECRET COOKIE'));expect(JSON.stringify(await dailySalesSync())).not.toContain('SECRET');});
 it('requires server authorization before enqueueing',async()=>{m.guard.mockRejectedValue(new Error('Denied'));await expect(dailySalesSync()).rejects.toThrow('Denied');expect(m.enqueue).not.toHaveBeenCalled();});
 it('requires explicit bulk approval and preserves reason/digest',async()=>{await expect(approveDailyJob('job','digest','Audited history',false)).rejects.toThrow('confirmation');expect(m.approve).not.toHaveBeenCalled();await approveDailyJob('job','digest','Audited history',true);expect(m.approve).toHaveBeenCalledWith({},m.actor,'job','digest','Audited history');});
 it('rejects unrecognized job controls',async()=>{await expect(controlDailyJob('job','overwrite')).rejects.toThrow('Invalid');expect(m.control).not.toHaveBeenCalled();});
});
