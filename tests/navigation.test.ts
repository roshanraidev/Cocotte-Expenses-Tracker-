import {describe,it,expect} from 'vitest';
import {accessibleWorkspaces,navigationItems,permittedHome} from '@/lib/navigation';
import {ALL_PERMISSIONS,type Permission} from '@/lib/permissions';
const account=(permissions:Permission[])=>({role:'CHEF' as const,permissions});
describe('effective permission navigation and landing',()=>{
 it('gives a recipe-only account a recipe home, single link and no workspace selector',()=>{const u=account(['recipes.view']);expect(permittedHome(u)).toBe('/recipes');expect(navigationItems(u).map(l=>l.label)).toEqual(['Recipes']);expect(accessibleWorkspaces(u)).toEqual([]);});
 it.each([
  [['purchasing.view'],'/orders'],[['reports.view'],'/reports'],[['settings.view'],'/admin/planning'],[['users.view'],'/admin/users'],[['inventory.view'],'/stock'],[['sales.view'],'/sales'],[['recipes.view','settings.view'],'/recipes'],[['dashboard.view','recipes.view'],'/dashboard'],[[],'/access-denied'],
 ] as [Permission[],string][])('selects an allowed home for %j',(permissions,home)=>{const u=account(permissions);expect(permittedHome(u)).toBe(home);if(home!=='/access-denied')expect(navigationItems(u).map(l=>l.href)).toContain(home);});
 it('does not grant access based on a privileged role name',()=>expect(permittedHome({role:'SUPER_USER',permissions:['recipes.view']})).toBe('/recipes'));
 it('retains the full existing Super User menu ordering and default home',()=>{const u={role:'SUPER_USER' as const,permissions:ALL_PERMISSIONS};expect(permittedHome(u)).toBe('/dashboard');expect(navigationItems(u).map(l=>l.label)).toEqual(['Dashboard','Supplier Purchases','Reports','Recipes','Weekly Planning','Supplier Management','Administration','User Management']);expect(accessibleWorkspaces(u)).toHaveLength(2);});
 it('hides unused workspace names and selects an accessible destination for each option',()=>{expect(accessibleWorkspaces(account(['recipes.view','settings.view']))).toEqual([{id:'food',label:'Food Purchasing',href:'/admin/planning'}]);expect(accessibleWorkspaces(account(['reports.view'])).map(w=>w.href)).toEqual(['/reports','/packaging/reports']);expect(accessibleWorkspaces(account(['purchasing.view'])).map(w=>w.href)).toEqual(['/orders','/packaging']);});
 it('preserves shared recipe access while browsing an accessible packaging workspace',()=>{const u=account(['recipes.view','reports.view']);expect(navigationItems(u,'/packaging/reports').map(l=>l.href)).toEqual(['/packaging/reports','/recipes']);});
 it('does not expose administration to a non-Super User with Dashboard view',()=>expect(navigationItems(account(['dashboard.view'])).map(l=>l.href)).not.toContain('/admin'));
 it('reflects new effective permissions without retaining previous navigation state',()=>{expect(permittedHome(account(['recipes.view']))).toBe('/recipes');expect(permittedHome(account(['reports.view']))).toBe('/reports');expect(navigationItems(account([]))).toEqual([]);});
});
