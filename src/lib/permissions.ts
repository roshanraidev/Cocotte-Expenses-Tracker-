/** Public permission names only. Authorization always uses the authenticated server actor. */
export const PERMISSION_MODULES=[
 {name:'Dashboard',actions:[['dashboard.view','View']]},
 {name:'Daily Sales',actions:[['sales.view','View'],['sales.create','Record'],['sales.correct','Correct recorded sales']]},
 {name:'Recipes',actions:[['recipes.view','View'],['recipes.create','Create'],['recipes.edit','Edit & manage specials'],['recipes.archive','Archive'],['recipes.restore','Restore']]},
 {name:'Suppliers',actions:[['suppliers.view','View'],['suppliers.create','Create'],['suppliers.edit','Edit'],['suppliers.deactivate','Deactivate / reactivate']]},
 {name:'Inventory',actions:[['inventory.view','View'],['inventory.create','Create catalogue products'],['inventory.edit','Enter stock counts'],['inventory.catalog','Edit catalogue & prices'],['inventory.confirm','Confirm stock count'],['inventory.correct','Correct historical / confirmed counts']]},
 {name:'Purchasing',actions:[['purchasing.view','View'],['purchasing.create','Create'],['purchasing.edit','Edit invoice drafts'],['purchasing.approve','Approve / confirm'],['purchasing.correct','Correct or void confirmed purchases']]},
 {name:'Reports',actions:[['reports.view','View'],['reports.export','Export']]},
 {name:'User Management',actions:[['users.view','View'],['users.create','Create'],['users.edit','Edit profile & roles'],['users.deactivate','Activate / deactivate'],['users.permissions','Manage permissions'],['users.reset','Issue password reset']]},
 {name:'System Settings',actions:[['settings.view','View planning & targets'],['settings.edit','Edit planning & targets']]},
] as const;
export type Permission=typeof PERMISSION_MODULES[number]['actions'][number][0];
export const ALL_PERMISSIONS:Permission[]=PERMISSION_MODULES.flatMap(m=>m.actions.map(a=>a[0]));
export const ROLE_LABELS={SUPER_USER:'Super User',ADMINISTRATOR:'Administrator',MANAGER:'Manager',HEAD_CHEF:'Head Chef',SOUS_CHEF:'Sous Chef',KITCHEN_STAFF:'Kitchen Staff',VIEWER:'Viewer'} as const;
export type AccessRole=keyof typeof ROLE_LABELS;
export type Overrides=Partial<Record<Permission,boolean>>;
const view:Permission[]=['dashboard.view','recipes.view','suppliers.view','inventory.view','purchasing.view','reports.view'];
// Preserve the old Chef access for existing accounts. Restricted corrections stay excluded.
export const LEGACY_CHEF:Permission[]=[...view,'sales.view','sales.create','inventory.edit','inventory.confirm','purchasing.create','purchasing.edit','purchasing.approve','reports.export'];
export const DEFAULT_PERMISSIONS:Record<AccessRole,readonly Permission[]>={
 SUPER_USER:ALL_PERMISSIONS,
 ADMINISTRATOR:ALL_PERMISSIONS.filter(p=>!p.startsWith('users.')),
 MANAGER:[...LEGACY_CHEF,'recipes.create','recipes.edit','suppliers.create','suppliers.edit','inventory.create','inventory.catalog','purchasing.correct'],
 HEAD_CHEF:[...LEGACY_CHEF,'recipes.create','recipes.edit'],
 SOUS_CHEF:[...view,'inventory.edit','purchasing.create','purchasing.edit'],
 KITCHEN_STAFF:['dashboard.view','recipes.view','inventory.view','inventory.edit'],
 VIEWER:view,
};
export type PermissionActor={role:'CHEF'|'SUPER_USER';permissions?:readonly Permission[]};
export function can(actor:PermissionActor,permission:Permission){return actor.permissions?actor.permissions.includes(permission):actor.role==='SUPER_USER'||LEGACY_CHEF.includes(permission);}
export function effectivePermissions(role:AccessRole,overrides:Overrides={},defaults:readonly Permission[]=DEFAULT_PERMISSIONS[role]):Permission[]{
 if(role==='SUPER_USER')return [...ALL_PERMISSIONS];
 const result=new Set(defaults);for(const [p,value] of Object.entries(overrides))if(ALL_PERMISSIONS.includes(p as Permission)){if(value)result.add(p as Permission);else result.delete(p as Permission);}
 return ALL_PERMISSIONS.filter(p=>result.has(p)&&result.has((p.split('.')[0]+'.view') as Permission));
}
export function parseOverrides(raw:unknown):Overrides{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid permission overrides.');
 const out:Overrides={};for(const [key,value] of Object.entries(raw)){if(!ALL_PERMISSIONS.includes(key as Permission)||typeof value!=='boolean')throw new Error('Unknown permission or invalid value.');out[key as Permission]=value;}
 return out;
}
export const OPERATION_PERMISSIONS:Record<string,Permission>={purchase:'purchasing.create','purchase-correct':'purchasing.correct','purchase-void':'purchasing.correct','stock-plan':'settings.edit',supplier:'suppliers.create','supplier-edit':'suppliers.edit','supplier-status':'suppliers.deactivate',product:'inventory.create','product-price':'inventory.catalog',order:'purchasing.create','order-status':'purchasing.edit',receipt:'purchasing.approve',invoice:'purchasing.approve',credit:'purchasing.correct','invoice-correct':'purchasing.correct','purchases-confirm':'purchasing.approve','stock-line':'inventory.edit','stock-confirm':'inventory.confirm',planning:'settings.edit','closing-total':'inventory.correct',finalize:'settings.edit',reopen:'settings.edit'};

export function packagingPermission(operation:string):Permission{return operation==='upload'?'purchasing.create':operation==='confirm'?'purchasing.approve':operation==='review'||operation==='scan'?'purchasing.edit':operation==='void'?'purchasing.correct':operation==='product'?'inventory.create':'inventory.catalog';}
