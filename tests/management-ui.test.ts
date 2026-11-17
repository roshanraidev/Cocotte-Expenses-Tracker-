import {describe,it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@/app/(protected)/operations/actions',()=>({saveOperation:vi.fn()}));
import {SupplierManagement,filterSuppliers,supplierWorkspace,type SupplierRow} from '@/components/management/suppliers';
import {AdministratorDashboard} from '@/components/management/administrator';
const food:SupplierRow={id:'a',name:'Albion Food',contact:'Chef Alice',email:'alice@example.test',phone:null,deliverySchedule:'Monday',active:true,foodWorkspace:true,packagingWorkspace:false};
const packaging:SupplierRow={...food,id:'b',name:'Box Company',contact:null,email:null,phone:'02000000000',active:false,foodWorkspace:false,packagingWorkspace:true};
const both:SupplierRow={...food,id:'c',name:'Combined Supplies',foodWorkspace:true,packagingWorkspace:true};
const rows=[food,packaging,both];
describe('supplier directory presentation',()=>{
 it('searches existing names, contacts, emails and phones without changing records',()=>{expect(filterSuppliers(rows,'ALICE','all','all','az').map(r=>r.id)).toEqual(['a','c']);expect(filterSuppliers(rows,'020000','all','all','az')).toEqual([packaging]);expect(rows[0]).toEqual(food);});
 it('combines status and workspace filters including shared suppliers',()=>{expect(filterSuppliers(rows,'','active','packaging','az')).toEqual([both]);expect(filterSuppliers(rows,'','inactive','food','az')).toEqual([]);});
 it('sorts name ascending, descending and active first',()=>{expect(filterSuppliers(rows,'','all','all','za').map(r=>r.id)).toEqual(['c','b','a']);expect(filterSuppliers([packaging,both,food],'','all','all','status').map(r=>r.id)).toEqual(['a','c','b']);});
 it('uses actual workspace flags without fabricating categories',()=>{expect(supplierWorkspace(food)).toBe('Food Purchasing');expect(supplierWorkspace(both)).toBe('Both workspaces');expect(supplierWorkspace({...food,foodWorkspace:false})).toBe('Unassigned');});
 it('keeps creation and editing controls exclusive to Super Users',()=>{const chef=renderToStaticMarkup(createElement(SupplierManagement,{rows,admin:false,name:'Chef'}));expect(chef).not.toContain('Add Supplier');expect(chef).not.toContain('Edit Albion');expect(chef).not.toContain('Restaurant accounts');expect(chef).toContain('View Albion Food');const admin=renderToStaticMarkup(createElement(SupplierManagement,{rows,admin:true,name:'Admin'}));expect(admin).toContain('Add Supplier');expect(admin).toContain('Edit Albion Food');});
 it('paginates instead of dropping supplier records and renders a real empty state',()=>{const many=Array.from({length:12},(_,i)=>({...food,id:String(i),name:`Supplier ${i}`}));const html=renderToStaticMarkup(createElement(SupplierManagement,{rows:many,admin:true,name:'Admin'}));expect(html).toContain('Page 1 of 2');expect(html.match(/aria-label="View Supplier/g)).toHaveLength(10);expect(renderToStaticMarkup(createElement(SupplierManagement,{rows:[],admin:false,name:'Chef'}))).toContain('Your supplier network starts here');});
});
describe('administrator analytics',()=>{
 it('reports exact signed invoice amounts including credits, without invented trends',()=>{const html=renderToStaticMarkup(createElement(AdministratorDashboard,{name:'Admin',total:3,active:2,users:1,previews:0,today:'2026-11-12',events:[],invoices:[{supplier:'Test',date:'2026-11-12',amount:'10000'},{supplier:'Test',date:'2026-11-11',amount:'-2500'},{supplier:'Old',date:'2026-01-01',amount:'999999'},{supplier:'Future',date:'2027-01-01',amount:'999999'}]}));expect(html).toContain('£75.00');expect(html).not.toContain('£9,999.99');expect(html).toContain('A clean slate');expect(html).not.toContain('Pending supplier approvals');});
});
