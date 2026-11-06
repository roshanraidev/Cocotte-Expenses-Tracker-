import { beforeEach,describe,it,expect,vi } from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/zonal/service',()=>({resolveImport:vi.fn(),fingerprint:vi.fn()}));
import { approveBatch,startBatch } from '@/lib/zonal/batch';
import { resolveImport } from '@/lib/zonal/service';
import { ZonalError } from '@/lib/zonal/validation';
import type { PrismaClient } from '@/generated/prisma/client';
const actor={id:'admin',restaurantId:'restaurant',role:'SUPER_USER' as const};
const resolve=vi.mocked(resolveImport);
function fixture(status='PARTIAL'){
 const read=vi.fn().mockResolvedValue({status,days:[{previewId:'new',status:'NEW'},{previewId:'blocked',status:'BLOCKED'},{previewId:'unchanged',status:'UNCHANGED'}]});
 const update=vi.fn().mockResolvedValue({count:1});
 return {read,update,prisma:{zonalSyncBatch:{findFirst:read},zonalSyncDay:{updateMany:update}} as unknown as PrismaClient};
}
beforeEach(()=>{resolve.mockReset();});
describe('explicit per-day batch approval orchestration',()=>{
 it('reports partial success without losing the eligible date',async()=>{
  const {prisma,update}=fixture();
  resolve.mockImplementation(async(_db,_actor,id)=>{if(id==='blocked')throw new ZonalError('Weekly forecast required');return 'Approved';});
  expect(await approveBatch(prisma,actor,'batch',['new','blocked'],false,'Historical test')).toEqual({approved:1,failed:1});
  expect(update).toHaveBeenCalledWith({where:{batchId:'batch',previewId:'new'},data:{status:'APPROVED',approvalError:null}});
  expect(update).toHaveBeenCalledWith({where:{batchId:'batch',previewId:'blocked'},data:{approvalError:'Weekly forecast required'}});
 });
 it('passes explicit correction confirmation and audit reason to the locked approval service',async()=>{
  const {prisma}=fixture();resolve.mockResolvedValue('Approved');
  await approveBatch(prisma,actor,'batch',['new'],true,'Verified report correction');
  expect(resolve).toHaveBeenCalledWith(prisma,actor,'new',false,true,'Verified report correction');
 });
 it('never approves unchanged or foreign selections',async()=>{
  for(const ids of [['unchanged'],['foreign'],['new','new'],[]]){
   await expect(approveBatch(fixture().prisma,actor,'batch',ids,true,'Reason')).rejects.toThrow();
  }
  expect(resolve).not.toHaveBeenCalled();
 });
 it('requires a completed fetch before approval',async()=>{
  await expect(approveBatch(fixture('RUNNING').prisma,actor,'batch',['new'],false,'')).rejects.toThrow('Wait for fetching');
  expect(resolve).not.toHaveBeenCalled();
 });
 it('scopes the batch read to the authenticated restaurant and rejects inaccessible batches',async()=>{
  const {prisma,read}=fixture();read.mockResolvedValue(null);
  await expect(approveBatch(prisma,actor,'foreign-batch',['new'],true,'Reason')).rejects.toThrow('not found');
  expect(read).toHaveBeenCalledWith({where:{id:'foreign-batch',restaurantId:actor.restaurantId},include:{days:true}});
  expect(resolve).not.toHaveBeenCalled();
 });
 it('requires Super User permissions before any batch database access',async()=>{
  const {prisma,read}=fixture();
  await expect(approveBatch(prisma,{...actor,role:'MANAGER' as typeof actor.role},'batch',['new'],false,'')).rejects.toThrow();
  await expect(startBatch(prisma,{...actor,role:'MANAGER' as typeof actor.role},'current','','')).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
 });
 it('does not persist unexpected database or authentication exception details',async()=>{
  const {prisma,update}=fixture();resolve.mockRejectedValue(new Error('sensitive database exception'));
  expect(await approveBatch(prisma,actor,'batch',['new'],false,'')).toEqual({approved:0,failed:1});
  expect(JSON.stringify(update.mock.calls)).not.toContain('sensitive');
 });
});
