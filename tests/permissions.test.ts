import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {ALL_PERMISSIONS,DEFAULT_PERMISSIONS,LEGACY_CHEF,ROLE_LABELS,effectivePermissions,can,parseOverrides,OPERATION_PERMISSIONS,type AccessRole} from '@/lib/permissions';
import {assertPermission} from '@/lib/access';
describe('server permission catalogue and role defaults',()=>{
 it.each(Object.keys(ROLE_LABELS) as AccessRole[])('resolves least-privilege defaults for %s',role=>{
  const permissions=effectivePermissions(role);expect(new Set(permissions).size).toBe(permissions.length);expect(permissions.every(p=>ALL_PERMISSIONS.includes(p))).toBe(true);if(role!=='SUPER_USER')for(const p of permissions)expect(permissions).toContain(p.split('.')[0]+'.view');
 });
 it('preserves existing Chef access without granting administrative writes',()=>{expect(can({role:'CHEF'},'purchasing.create')).toBe(true);expect(can({role:'CHEF'},'purchasing.approve')).toBe(true);expect(can({role:'CHEF'},'users.permissions')).toBe(false);expect(can({role:'CHEF'},'recipes.archive')).toBe(false);expect(can({role:'CHEF'},'inventory.catalog')).toBe(false);expect(LEGACY_CHEF).toContain('reports.export');});
 it('supports individual grants/revocations and cannot deny the Super User control set',()=>{expect(effectivePermissions('VIEWER',{'reports.export':true})).toContain('reports.export');expect(effectivePermissions('ADMINISTRATOR',{'recipes.archive':false})).not.toContain('recipes.archive');expect(effectivePermissions('SUPER_USER',{'users.permissions':false})).toEqual(ALL_PERMISSIONS);});
 it('honours configurable role defaults and explicit user denials',()=>{expect(effectivePermissions('VIEWER',{'reports.export':false},[...DEFAULT_PERMISSIONS.VIEWER,'reports.export'])).not.toContain('reports.export');});
 it('does not expose module actions without View permission',()=>{const result=effectivePermissions('VIEWER',{'reports.view':false,'reports.export':true});expect(result).not.toContain('reports.export');});
 it('fails closed for an authenticated Viewer even when its legacy backing role is Chef',()=>{const actor={role:'CHEF' as const,permissions:effectivePermissions('VIEWER')};for(const p of ['users.create','suppliers.edit','inventory.edit','recipes.create','purchasing.approve','sales.create'] as const)expect(()=>assertPermission(actor,p)).toThrow('permission');});
 it.each([{godmode:true},{'users.permissions':'true'},['users.permissions'],null])('rejects unrecognised or malformed browser overrides %j',raw=>expect(()=>parseOverrides(raw)).toThrow());
 it('uses supported actions and covers all existing operation mutations',()=>{expect(ALL_PERMISSIONS).not.toContain('suppliers.delete');expect(ALL_PERMISSIONS).not.toContain('inventory.delete');expect(Object.keys(OPERATION_PERMISSIONS)).toContain('supplier-status');expect(OPERATION_PERMISSIONS['purchase-correct']).toBe('purchasing.correct');});
});
it('retains Super User-only legacy financial controls even when a role can approve normal purchases',async()=>{
 const {runOperation}=await import('@/lib/operations');
 const tx={$queryRaw:async()=>[]};
 const prisma={$transaction:async(cb:(tx:unknown)=>Promise<unknown>)=>cb(tx)} as unknown as import('@/generated/prisma/client').PrismaClient;
 for(const permissions of [LEGACY_CHEF,effectivePermissions('ADMINISTRATOR')])for(const operation of ['invoice','order','purchases-confirm'])await expect(runOperation(prisma,{id:'staff',restaurantId:'restaurant',role:'CHEF',permissions},operation,{})).rejects.toThrow('Only Super Users');
});
