import {requirePermission} from '@/lib/auth';
import {db} from '@/lib/db';
import {resolveAccess} from '@/lib/access';
import {ROLE_LABELS,PERMISSION_MODULES,type AccessRole,type Permission,type Overrides} from '@/lib/permissions';
import UserManagement from './users';
import {LiveRefresh} from '@/components/live-refresh';
const permissionLabels=new Map<string,string>(PERMISSION_MODULES.flatMap(m=>m.actions.map(([key,label])=>[key,`${m.name}: ${label}`] as [string,string])));
function describeAudit(value:unknown):string[]{
 if(Array.isArray(value))return value.filter(v=>typeof v==='string'&&permissionLabels.has(v)).map(v=>permissionLabels.get(v)!);
 if(!value||typeof value!=='object')return [];
 const input=value as Record<string,unknown>,lines:string[]=[];
 for(const key of ['name','email'])if(typeof input[key]==='string')lines.push(`${key==='name'?'Name':'Email'}: ${input[key]}`);
 const role=input.accessRole??input.role;if(typeof role==='string')lines.push(`Role: ${ROLE_LABELS[role as AccessRole]??(role==='CHEF'?'Chef (existing account)':role)}`);
 if(typeof input.active==='boolean')lines.push(input.active?'Account active':'Account inactive');
 if(input.permissions&&typeof input.permissions==='object'&&!Array.isArray(input.permissions))for(const [key,allowed] of Object.entries(input.permissions))if(permissionLabels.has(key)&&typeof allowed==='boolean')lines.push(`${permissionLabels.get(key)}: ${allowed?'Allowed':'Denied'} (individual override)`);
 return lines;
}
export default async function UsersPage(){
 const actor=await requirePermission('users.view'),prisma=db();
 const [users,policies,logs]=await Promise.all([prisma.user.findMany({where:{restaurantId:actor.restaurantId},select:{id:true,name:true,email:true,role:true,accessRole:true,permissionOverrides:true,active:true,restaurantId:true,updatedAt:true,lastLoginAt:true},orderBy:{name:'asc'}}),prisma.accessRolePolicy.findMany({where:{restaurantId:actor.restaurantId}}),prisma.auditLog.findMany({where:{restaurantId:actor.restaurantId,entity:'User'},orderBy:{createdAt:'desc'},take:30,include:{actor:{select:{name:true}}}})]);
 const rows=await Promise.all(users.map(async u=>({id:u.id,name:u.name,email:u.email,role:u.role,accessRole:u.accessRole,permissionOverrides:u.permissionOverrides as Overrides|null,active:u.active,version:u.updatedAt.toISOString(),lastLogin:u.lastLoginAt?.toISOString()??null,permissions:(await resolveAccess(prisma,u)).permissions})));
 return <><LiveRefresh/><UserManagement rows={rows} actor={actor} policies={Object.fromEntries(policies.map(p=>[p.role,p.permissions])) as Partial<Record<AccessRole,Permission[]>>} activity={logs.map(l=>({id:l.id,label:l.action,actor:l.actor?.name??'System',date:l.createdAt.toISOString(),target:users.find(u=>u.id===l.entityId)?.name??ROLE_LABELS[l.entityId as AccessRole]??'Account',before:describeAudit(l.before),after:describeAudit(l.after)}))}/></>;
}
