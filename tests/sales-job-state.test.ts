import {describe,it,expect} from 'vitest';
import {jobDisplayState} from '@/lib/sales-history/job-state';
const job=(status:string,days:string[],leaseUntil:Date|null=null)=>({status,days:days.map(status=>({status})),leaseUntil,activeBatchId:null,phase:'FETCH'});
describe('honest sales progress states',()=>{
 it('shows queued progress as waiting rather than pretending it is running or complete',()=>{const s=jobDisplayState(job('QUEUED',['STAGED','FAILED','PENDING'],new Date(20000)),true,10000);expect(s.state).toBe('waiting');expect(s.detail).toContain('next bounded batch');});
 it('distinguishes an active lease from a dead worker',()=>{expect(jobDisplayState(job('RUNNING',['PENDING'],new Date(20000)),true,10000).state).toBe('running');expect(jobDisplayState(job('RUNNING',['PENDING'],new Date(0)),true,10000).state).toBe('waiting');expect(jobDisplayState(job('RUNNING',['PENDING'],new Date(20000)),false,10000).detail).toContain('offline');});
 it('preserves explicit pauses and reports all-failed runs correctly',()=>{expect(jobDisplayState(job('PAUSED',['FAILED','PENDING']),true).state).toBe('paused');expect(jobDisplayState(job('REVIEW',['FAILED','FAILED']),true).state).toBe('failed');});
 it('distinguishes completed retrieval from approved sales',()=>{expect(jobDisplayState(job('REVIEW',['STAGED','FAILED']),true)).toMatchObject({state:'completed',detail:expect.stringContaining('still require approval')});expect(jobDisplayState(job('COMPLETE',['APPROVED','SKIPPED']),true).state).toBe('completed');});
});
