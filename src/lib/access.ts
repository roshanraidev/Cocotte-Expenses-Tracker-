import 'server-only';
import type {Prisma,PrismaClient,User} from '@/generated/prisma/client';
import {DEFAULT_PERMISSIONS,LEGACY_CHEF,ALL_PERMISSIONS,can,effectivePermissions,parseOverrides,type AccessRole,type Permission} from './permissions';
export type AccessUser=Pick<User,'id'|'restaurantId'|'name'|'email'|'role'|'active'|'accessRole'|'permissionOverrides'>;
export async function resolveAccess(prisma:PrismaClient|Prisma.TransactionClient,user:AccessUser){
 if(user.role==='SUPER_USER')return {...user,permissions:[...ALL_PERMISSIONS]};
 if(!user.accessRole)return {...user,permissions:[...LEGACY_CHEF]};
 const policy=await prisma.accessRolePolicy.findUnique({where:{restaurantId_role:{restaurantId:user.restaurantId,role:user.accessRole}}});
 const defaults=policy?policy.permissions as Permission[]:DEFAULT_PERMISSIONS[user.accessRole as AccessRole];
 return {...user,permissions:effectivePermissions(user.accessRole,user.permissionOverrides?parseOverrides(user.permissionOverrides):{},defaults)};
}
export class AccessError extends Error {}
export function assertPermission(actor:Parameters<typeof can>[0],permission:Permission){if(!can(actor,permission))throw new AccessError('You do not have permission to perform this action.');}
