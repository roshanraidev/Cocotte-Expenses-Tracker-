import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {addDays,dateKey,dateValue,londonToday} from '@/lib/dates';
import {AdministratorDashboard} from '@/components/management/administrator';
import {LiveRefresh} from '@/components/live-refresh';
function recentPreviewStart(){return new Date(Date.now()-30*60*1000);}
export default async function AdminPage(){
 const user=await requireAdmin(),prisma=db(),today=londonToday(),restaurantId=user.restaurantId;
 const [total,active,users,previews,logs,invoices]=await Promise.all([
  prisma.supplier.count({where:{restaurantId}}),prisma.supplier.count({where:{restaurantId,active:true}}),prisma.user.count({where:{restaurantId,active:true}}),
  prisma.zonalImport.count({where:{restaurantId,status:'PREVIEW',createdAt:{gte:recentPreviewStart()}}}),
  prisma.auditLog.findMany({where:{restaurantId},orderBy:{createdAt:'desc'},take:20,include:{actor:{select:{name:true}}}}),
  prisma.purchaseInvoice.findMany({where:{restaurantId,confirmedAt:{not:null},voidedAt:null,accountingDate:{gte:dateValue(addDays(today,-89)),lte:dateValue(today)}},select:{amountPence:true,accountingDate:true,supplier:{select:{name:true}}}}),
 ]);
 return <><LiveRefresh/><AdministratorDashboard name={user.name} total={total} active={active} users={users} previews={previews} today={today} events={logs.map(l=>({id:l.id,action:l.action,entity:l.entity,actor:l.actor?.name??'System',date:l.createdAt.toISOString()}))} invoices={invoices.map(i=>({supplier:i.supplier.name,date:dateKey(i.accountingDate),amount:i.amountPence.toString()}))}/></>;
}
