import {beforeEach,expect,it,vi} from 'vitest';
import type {PrismaClient} from '@/generated/prisma/client';
vi.mock('server-only',()=>({}));vi.mock('@/lib/zonal/crypto',()=>({decryptCredentials:()=>({username:'synthetic',password:'synthetic'})}));
import {previewZonalDeliveries,DeliveryPreviewError,deliveryErrors,clearDeliveryPreviewCache} from '@/lib/zonal/delivery-preview';
const actor={id:'admin',restaurantId:'owned',role:'SUPER_USER' as const};
const record={id:'fixture',date:'2026-01-02',supplier:'Test Supplier',document:'TEST1',items:'100',unknown:'0',invoice:'100',credit:'0',total:'100',period:'fixture period'};
let tx:ReturnType<typeof database>['tx'];
function database(){const tx={$queryRaw:vi.fn().mockResolvedValue([{locked:true}]),zonalSyncBatch:{count:vi.fn().mockResolvedValue(0)},zonalConnection:{findUnique:vi.fn().mockResolvedValue({branch:'003 – Parsons Green',encryptedCredentials:'fixture',lastAttemptAt:null}),update:vi.fn()},zonalDeliveryPreview:{create:vi.fn().mockResolvedValue({id:'preview-fixture-test'})},zonalDeliveryImport:{findMany:vi.fn().mockResolvedValue([])},weeklyForecast:{findMany:vi.fn().mockResolvedValue([])},supplier:{findMany:vi.fn().mockResolvedValue([{id:'supplier',name:'Test Supplier',active:true,foodWorkspace:true}])},purchaseInvoice:{findMany:vi.fn().mockResolvedValue([])},auditLog:{create:vi.fn()}};const prisma={...tx,$transaction:async(f:(t:typeof tx)=>unknown)=>f(tx)} as unknown as PrismaClient;return {tx,prisma};}
let prisma:PrismaClient;const runner=vi.fn();
beforeEach(()=>{clearDeliveryPreviewCache();({tx,prisma}=database());runner.mockReset().mockResolvedValue({ok:true,records:[record],periods:['fixture period'],rowsChecked:1});});
it('reads matching suppliers and invoices only within the actor restaurant',async()=>{const result=await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);expect(result.rows[0].match).toBe('MATCHED');expect(tx.supplier.findMany.mock.calls[0][0].where.restaurantId).toBe('owned');expect(tx.purchaseInvoice.findMany.mock.calls[0][0].where.restaurantId).toBe('owned');expect(result.rows[0].eligible).toBe(false);});
it('rejects unauthorised users before opening a worker',async()=>{await expect(previewZonalDeliveries(prisma,{...actor,role:'CHEF'},'2026-01-01','2026-01-30',runner)).rejects.toThrow();expect(runner).not.toHaveBeenCalled();});
it('refuses concurrent previews',async()=>{tx.$queryRaw.mockResolvedValue([{locked:false}]);await expect(previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner)).rejects.toThrow('already running');expect(runner).not.toHaveBeenCalled();});
it('respects sales jobs and login cooldowns',async()=>{tx.zonalSyncBatch.count.mockResolvedValue(1);await expect(previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner)).rejects.toThrow('sales sync');tx.zonalSyncBatch.count.mockResolvedValue(0);tx.zonalConnection.findUnique.mockResolvedValue({branch:'003 – Parsons Green',encryptedCredentials:'fixture',lastAttemptAt:new Date()});await expect(previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner)).rejects.toThrow('one minute');});
it('does not invent preview results on network failure',async()=>{runner.mockRejectedValue(new Error('sensitive detail'));const result=await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);expect(result.rows).toEqual([]);expect(result.error).not.toContain('sensitive');expect(tx.purchaseInvoice.findMany).not.toHaveBeenCalled();});
it('supports an empty successful range and multiple periods',async()=>{runner.mockResolvedValue({records:[],periods:['period1','period2'],rowsChecked:0});const result=await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);expect(result.error).toBe('');expect(result.rows).toEqual([]);expect(result.periods).toHaveLength(2);});
it('repeated previews never create a financial record',async()=>{const first=await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);const second=await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);expect(first.rows).toEqual(second.rows);expect(tx.purchaseInvoice).not.toHaveProperty('create');expect(tx.supplier).not.toHaveProperty('create');});

it('reports an expired session without retrying authentication',async()=>{runner.mockRejectedValue(new DeliveryPreviewError(deliveryErrors.SESSION_EXPIRED));const result=await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);expect(result.error).toContain('session expired');expect(runner).toHaveBeenCalledTimes(1);expect(result.rows).toEqual([]);});

it('reuses a short-lived source preview without logging in again, but rechecks purchases',async()=>{
 const first=await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);
 tx.purchaseInvoice.findMany.mockResolvedValue([{id:'manual',supplierId:'supplier',reference:'TEST1',voidedAt:null}]);
 const second=await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);
 expect(runner).toHaveBeenCalledTimes(1);expect(second.timings?.cacheHit).toBe(true);expect(second.fetchedAt).toBe(first.fetchedAt);expect(second.rows[0].duplicate).toBe(true);expect(tx.purchaseInvoice.findMany).toHaveBeenCalledTimes(2);
});
it('invalidates cached supplier matches when supplier configuration changes',async()=>{
 await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);
 tx.supplier.findMany.mockResolvedValue([{id:'supplier',name:'Renamed',active:true,foodWorkspace:true}]);
 await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);expect(runner).toHaveBeenCalledTimes(2);
});
it('does not share source preview caches across restaurants or connection revisions',async()=>{
 await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);
 await previewZonalDeliveries(prisma,{...actor,restaurantId:'other'},'2026-01-01','2026-01-30',runner);
 tx.zonalConnection.findUnique.mockResolvedValue({branch:'003 – Parsons Green',encryptedCredentials:'fixture',lastAttemptAt:null,revision:99});
 await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);expect(runner).toHaveBeenCalledTimes(3);
});
it('expires source previews after 30 seconds instead of treating unchanged list values as a version token',async()=>{
 await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+31000);
 try{await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);expect(runner).toHaveBeenCalledTimes(2);}finally{clock.mockRestore();}
});
it('does not serve a cached preview after disconnection',async()=>{
 await previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner);
 tx.zonalConnection.findUnique.mockResolvedValue({branch:'003 – Parsons Green',encryptedCredentials:null,lastAttemptAt:null});
 await expect(previewZonalDeliveries(prisma,actor,'2026-01-01','2026-01-30',runner)).rejects.toThrow('Connect Zonal');expect(runner).toHaveBeenCalledTimes(1);
});
