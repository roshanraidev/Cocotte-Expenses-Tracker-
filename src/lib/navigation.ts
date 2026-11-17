import {can,type Permission,type PermissionActor} from './permissions';
export type NavigationItem={href:string;label:string;icon:'dashboard'|'receipt'|'truck'|'reports'|'settings'|'store'|'planning'|'recipes'|'users'|'inventory';group:'main'|'management'|'shared'};
type Section=NavigationItem&{permission:Permission;superUserOnly?:boolean;dashboardAlternative?:boolean};
const food:Section[]=[
 {href:'/dashboard',label:'Dashboard',icon:'dashboard',group:'main',permission:'dashboard.view'},
 {href:'/orders',label:'Supplier Purchases',icon:'truck',group:'main',permission:'purchasing.view'},
 {href:'/reports',label:'Reports',icon:'reports',group:'main',permission:'reports.view'},
 {href:'/recipes',label:'Recipes',icon:'recipes',group:'main',permission:'recipes.view'},
 // These routes otherwise have no sidebar entry; expose them when the full Dashboard is unavailable.
 {href:'/sales',label:'Daily Sales',icon:'receipt',group:'main',permission:'sales.view',dashboardAlternative:true},
 {href:'/stock',label:'Inventory',icon:'inventory',group:'main',permission:'inventory.view',dashboardAlternative:true},
 {href:'/admin/planning',label:'Weekly Planning',icon:'planning',group:'management',permission:'settings.view'},
 {href:'/suppliers',label:'Supplier Management',icon:'store',group:'management',permission:'suppliers.view'},
 {href:'/admin',label:'Administration',icon:'settings',group:'management',permission:'dashboard.view',superUserOnly:true},
 {href:'/admin/users',label:'User Management',icon:'users',group:'management',permission:'users.view'},
];
const packaging:Section[]=[
 {href:'/packaging',label:'Dashboard',icon:'dashboard',group:'main',permission:'purchasing.view'},
 {href:'/packaging/invoices',label:'Invoices',icon:'receipt',group:'main',permission:'purchasing.view'},
 {href:'/packaging/products',label:'Product catalogue',icon:'store',group:'main',permission:'inventory.view'},
 {href:'/packaging/reports',label:'Reports',icon:'reports',group:'main',permission:'reports.view'},
 {href:'/packaging/suppliers',label:'Supplier Management',icon:'truck',group:'management',permission:'suppliers.view'},
];
function accessible(actor:PermissionActor,sections:Section[]){return sections.filter(s=>can(actor,s.permission)&&(!s.superUserOnly||actor.role==='SUPER_USER')&&(!s.dashboardAlternative||!can(actor,'dashboard.view')));}
export type AccessibleWorkspace={id:'food'|'packaging';label:string;href:string};
export function accessibleWorkspaces(actor:PermissionActor):AccessibleWorkspace[]{
 const links=accessible(actor,food);
 const operational=links.find(l=>['/dashboard','/orders','/reports','/stock','/admin/planning'].includes(l.href));
 const pack=accessible(actor,packaging).find(l=>l.href!=='/packaging/suppliers');
 return [...(operational?[{id:'food' as const,label:'Food Purchasing',href:operational.href}]:[]),...(pack?[{id:'packaging' as const,label:'Packaging & Chemicals',href:pack.href}]:[])];
}
export function navigationItems(actor:PermissionActor,path=''):NavigationItem[]{
 if(path.startsWith('/packaging')&&accessibleWorkspaces(actor).some(w=>w.id==='packaging')){
  const shared=accessible(actor,food).filter(s=>['/recipes','/admin/planning','/admin','/admin/users','/sales'].includes(s.href)).map(s=>({...s,group:'shared' as const}));
  return [...accessible(actor,packaging),...shared];
 }
 return accessible(actor,food);
}
/** Navigation policy only: each destination retains its own server authorization. */
export function permittedHome(actor:PermissionActor){return accessible(actor,food)[0]?.href??'/access-denied';}
