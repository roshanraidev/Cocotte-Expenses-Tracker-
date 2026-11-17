import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),preview:vi.fn(),headers:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireAdmin:mocks.admin}));
vi.mock('@/lib/db',()=>({db:()=>({})}));
vi.mock('@/lib/zonal/delivery-import',()=>({importZonalDeliveries:vi.fn()}));
vi.mock('next/headers',()=>({headers:mocks.headers}));
vi.mock('@/lib/zonal/delivery-preview',()=>({previewZonalDeliveries:mocks.preview,DeliveryPreviewError:class extends Error{}}));
import {checkZonalDeliveries} from '@/app/(protected)/orders/zonal-delivery-actions';
const form=()=>{const f=new FormData();f.set('from','2026-01-01');f.set('to','2026-01-30');f.set('restaurantId','foreign');return f;};
beforeEach(()=>{vi.clearAllMocks();mocks.admin.mockResolvedValue({id:'admin',restaurantId:'owned',role:'SUPER_USER'});mocks.headers.mockResolvedValue(new Headers({origin:'https://cocotte.test',host:'cocotte.test'}));mocks.preview.mockResolvedValue({error:'',rows:[],periods:['test period'],rowsChecked:0,fetchedAt:'2026-01-30T12:00:00Z'});});
it('requires server-side Super User authorisation before any read',async()=>{mocks.admin.mockRejectedValue(new Error('Not authorised'));await expect(checkZonalDeliveries({error:'',message:''},form())).rejects.toThrow('Not authorised');expect(mocks.preview).not.toHaveBeenCalled();});
it('uses the actor restaurant, never a submitted restaurant ID',async()=>{const result=await checkZonalDeliveries({error:'',message:''},form());expect(mocks.preview.mock.calls[0][1].restaurantId).toBe('owned');expect(result.message).toContain('No purchases were created');});
it('rejects cross-origin requests before opening a worker',async()=>{mocks.headers.mockResolvedValue(new Headers({origin:'https://foreign.test',host:'cocotte.test'}));expect((await checkZonalDeliveries({error:'',message:''},form())).error).toBeTruthy();expect(mocks.preview).not.toHaveBeenCalled();});
it('returns safe infrastructure errors',async()=>{mocks.preview.mockRejectedValue(new Error('confidential database detail'));const result=await checkZonalDeliveries({error:'',message:''},form());expect(result.error).toContain('No purchases were changed');expect(JSON.stringify(result)).not.toContain('confidential');});
it('rejects invalid ranges before opening a worker',async()=>{const f=form();f.set('to','2025-01-01');expect((await checkZonalDeliveries({error:'',message:''},f)).error).toContain('From');expect(mocks.preview).not.toHaveBeenCalled();});
it('does not invent results on retrieval failure',async()=>{mocks.preview.mockResolvedValue({error:'Session expired',rows:[],periods:[],rowsChecked:0,fetchedAt:null});const result=await checkZonalDeliveries({error:'',message:''},form());expect(result.message).toBe('');expect(result.error).toBe('Session expired');});
it('keeps the selected seven-day week in the dialog while fetching only elapsed London dates',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
 try{
  const f=form();f.set('from','2026-11-09');f.set('to','2026-11-15');
  const result=await checkZonalDeliveries({error:'',message:''},f);
  expect(result.range).toEqual({from:'2026-11-09',to:'2026-11-15'});
  expect(mocks.preview).toHaveBeenCalledWith({},expect.objectContaining({restaurantId:'owned'}),'2026-11-09','2026-11-11');
  expect(result.message).toContain('Future days excluded');
 }finally{vi.useRealTimers();}
});
