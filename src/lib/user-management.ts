import 'server-only';
import {z} from 'zod';
import {randomBytes} from 'node:crypto';
import {Prisma,type PrismaClient} from '@/generated/prisma/client';
import {hashPassword} from './password';
import {hashToken} from './tokens';
import {emailSchema,passwordSchema} from './validation';
import {resolveAccess,assertPermission,AccessError,type AccessUser} from './access';
import {ROLE_LABELS,ALL_PERMISSIONS,DEFAULT_PERMISSIONS,effectivePermissions,parseOverrides,can,type AccessRole,type Permission} from './permissions';
const role=z.enum(Object.keys(ROLE_LABELS) as [AccessRole,...AccessRole[]]);
const details=z.object({id:z.string().max(100).optional(),name:z.string().trim().min(1).max(100),email:emailSchema,accessRole:role,overrides:z.unknown(),version:z.string().optional()});
async function lockActor(tx:Prisma.TransactionClient,actor:{id:string;restaurantId:string},permission:Permission|Permission[]){
 await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${actor.restaurantId} FOR UPDATE`;
 const current=await tx.user.findFirst({where:{id:actor.id,restaurantId:actor.restaurantId,active:true}});
 if(!current)throw new AccessError('Your account is no longer authorised.');
 const authorised=await resolveAccess(tx,current);if(Array.isArray(permission)){if(!permission.some(p=>can(authorised,p)))throw new AccessError('You do not have permission for this action.');}else assertPermission(authorised,permission);return authorised;
}
async function audit(tx:Prisma.TransactionClient,actor:{id:string;restaurantId:string},id:string,action:string,before:unknown,after:unknown){await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,entity:'User',entityId:id,action,before:before as Prisma.InputJsonValue,after:after as Prisma.InputJsonValue}});}
async function assertManageable(tx:Prisma.TransactionClient,manager:Awaited<ReturnType<typeof resolveAccess>>,target:AccessUser){
 if(manager.role==='SUPER_USER')return;
 const access=await resolveAccess(tx,target);
 if(target.role==='SUPER_USER'||access.permissions.some(p=>!can(manager,p)))throw new AccessError('You cannot manage an account with broader access than your own.');
}
const safe=(u:AccessUser)=>({name:u.name,email:u.email,active:u.active,role:u.role,accessRole:u.accessRole,permissions:u.permissionOverrides??{}});
export async function saveManagedUser(prisma:PrismaClient,actor:{id:string;restaurantId:string},raw:unknown,password?:string){
 const input=details.parse(raw);let overrides;try{overrides=parseOverrides(input.overrides);}catch{throw new AccessError('Unknown permission or invalid permission override.');}const passwordHash=input.id?undefined:await hashPassword(passwordSchema.parse(password));
 return prisma.$transaction(async tx=>{
  const manager=await lockActor(tx,actor,input.id?['users.edit','users.permissions']:'users.create');
  const target=input.id?await tx.user.findFirst({where:{id:input.id,restaurantId:actor.restaurantId}}):null;
  if(target&&!can(manager,'users.edit')&&(target.name!==input.name||target.email!==input.email))throw new AccessError('Profile editing requires Edit User permission.');
  if(input.id&&!target)throw new AccessError('This account is unavailable.');
  if(target)await assertManageable(tx,manager,target);
  if(target&&target.updatedAt.toISOString()!==input.version)throw new AccessError('This account changed. Reload before saving.');
  const accessChanged=!target||(target.accessRole??(target.role==='SUPER_USER'?'SUPER_USER':'HEAD_CHEF'))!==input.accessRole||JSON.stringify(target.permissionOverrides??{})!==JSON.stringify(overrides);
  if(accessChanged&&(target||Object.keys(overrides).length))assertPermission(manager,'users.permissions');
  if(target?.id===actor.id&&accessChanged)throw new AccessError('Use another authorised Super User to change your own role or permissions.');
  if(manager.role!=='SUPER_USER'){
   if(target?.role==='SUPER_USER'||input.accessRole==='SUPER_USER')throw new AccessError('Only a Super User can manage Super User accounts.');
   const policy=await tx.accessRolePolicy.findUnique({where:{restaurantId_role:{restaurantId:actor.restaurantId,role:input.accessRole}}});
   const requested=effectivePermissions(input.accessRole,overrides,policy?policy.permissions as Permission[]:DEFAULT_PERMISSIONS[input.accessRole]);
   if(requested.some(p=>!can(manager,p)))throw new AccessError('You cannot grant permissions beyond your own access.');
  }
  if(input.accessRole==='SUPER_USER'&&Object.keys(overrides).length)throw new AccessError('Super Users retain the complete permission set.');
  if(target?.role==='SUPER_USER'&&input.accessRole!=='SUPER_USER'&&target.active&&await tx.user.count({where:{restaurantId:actor.restaurantId,active:true,role:'SUPER_USER'}})<=1)throw new AccessError('The last active Super User must be retained.');
  const data={name:input.name,email:input.email,accessRole:target&&!accessChanged?target.accessRole:input.accessRole,role:input.accessRole==='SUPER_USER'?'SUPER_USER' as const:'CHEF' as const,permissionOverrides:overrides as Prisma.InputJsonValue};
  const saved=target?await tx.user.update({where:{id:target.id},data}):await tx.user.create({data:{...data,passwordHash:passwordHash!,restaurantId:actor.restaurantId}});
  if(target){await tx.session.deleteMany({where:{userId:target.id}});await tx.passwordReset.deleteMany({where:{userId:target.id}});}
  await audit(tx,manager,saved.id,target?'USER_UPDATED':'USER_CREATED',target?safe(target):{},safe(saved));
  if(target&&target.accessRole!==saved.accessRole)await audit(tx,manager,saved.id,'USER_ROLE_CHANGED',{role:target.accessRole??target.role},{role:saved.accessRole});
  if(accessChanged)await audit(tx,manager,saved.id,'USER_PERMISSIONS_CHANGED',{permissions:target?.permissionOverrides??{}},{permissions:overrides});
  return saved.id;
 });
}
export async function setUserActive(prisma:PrismaClient,actor:{id:string;restaurantId:string},id:string,active:boolean){return prisma.$transaction(async tx=>{
 const manager=await lockActor(tx,actor,'users.deactivate');
 if(id===actor.id)throw new AccessError('You cannot deactivate or reactivate your own account.');
 const target=await tx.user.findFirst({where:{id,restaurantId:actor.restaurantId}});if(!target)throw new AccessError('This account is unavailable.');
 await assertManageable(tx,manager,target);
 if(!active&&target.role==='SUPER_USER'&&target.active&&await tx.user.count({where:{restaurantId:actor.restaurantId,active:true,role:'SUPER_USER'}})<=1)throw new AccessError('The last active Super User must be retained.');
 if(active===target.active)return;
 await tx.user.update({where:{id},data:{active}});await tx.session.deleteMany({where:{userId:id}});await tx.passwordReset.deleteMany({where:{userId:id}});
 await audit(tx,manager,id,active?'USER_ACTIVATED':'USER_DEACTIVATED',{active:target.active},{active});
});}
export async function saveRolePolicy(prisma:PrismaClient,actor:{id:string;restaurantId:string},accessRole:AccessRole,permissions:Permission[]){
 if(!Object.keys(ROLE_LABELS).includes(accessRole)||accessRole==='SUPER_USER'||permissions.some(p=>!ALL_PERMISSIONS.includes(p)))throw new AccessError('Invalid configurable role or permission.');
 return prisma.$transaction(async tx=>{const manager=await lockActor(tx,actor,'users.permissions');if(manager.role!=='SUPER_USER')throw new AccessError('Only Super Users can change default roles.');const before=await tx.accessRolePolicy.findUnique({where:{restaurantId_role:{restaurantId:actor.restaurantId,role:accessRole}}});
 await tx.accessRolePolicy.upsert({where:{restaurantId_role:{restaurantId:actor.restaurantId,role:accessRole}},create:{restaurantId:actor.restaurantId,role:accessRole,permissions},update:{permissions}});
 await tx.session.deleteMany({where:{user:{restaurantId:actor.restaurantId,accessRole}}});await tx.passwordReset.deleteMany({where:{user:{restaurantId:actor.restaurantId,accessRole}}});await audit(tx,manager,accessRole,'ROLE_DEFAULT_PERMISSIONS_CHANGED',before?.permissions??DEFAULT_PERMISSIONS[accessRole],permissions);
 });
}
export async function issuePasswordReset(prisma:PrismaClient,actor:{id:string;restaurantId:string},id:string){
 const token=randomBytes(32).toString('hex');
 await prisma.$transaction(async tx=>{const manager=await lockActor(tx,actor,'users.reset');const target=await tx.user.findFirst({where:{id,restaurantId:actor.restaurantId,active:true}});if(!target)throw new AccessError('Choose an active account.');await assertManageable(tx,manager,target);
 await tx.passwordReset.deleteMany({where:{userId:id}});await tx.passwordReset.create({data:{userId:id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+15*60*1000)}});await tx.session.deleteMany({where:{userId:id}});await audit(tx,manager,id,'PASSWORD_RESET_ISSUED',{},{});
 });return token;
}
