import {can} from '@/lib/permissions';
import {requirePermission} from '@/lib/auth';
import {db} from '@/lib/db';
import {LiveRefresh} from '@/components/live-refresh';
import {SupplierManagement} from '@/components/management/suppliers';
export default async function Suppliers(){
 const user=await requirePermission('suppliers.view');
 const rows=await db().supplier.findMany({where:{restaurantId:user.restaurantId},orderBy:{name:'asc'},select:{id:true,name:true,contact:true,email:true,phone:true,deliverySchedule:true,active:true,foodWorkspace:true,packagingWorkspace:true}});
 return <><LiveRefresh/><SupplierManagement name={user.name} admin={can(user,'suppliers.create')||can(user,'suppliers.edit')||can(user,'suppliers.deactivate')} capabilities={{create:can(user,'suppliers.create'),edit:can(user,'suppliers.edit'),deactivate:can(user,'suppliers.deactivate')}} rows={rows}/></>;
}
