'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {can} from '@/lib/permissions';
import {requireUser,requirePermission} from '@/lib/auth';
import {db} from '@/lib/db';
import {Prisma} from '@/generated/prisma/client';
import {AccessError} from '@/lib/access';
import {saveManagedUser,setUserActive,saveRolePolicy,issuePasswordReset} from '@/lib/user-management';
import type {AccessRole,Permission} from '@/lib/permissions';
export type UserResult={error:string;success:string;resetPath?:string;requestId?:string};
export async function manageUser(_:UserResult,form:FormData):Promise<UserResult>{
 const operation=String(form.get('operation')??'');
 const current=await requireUser();
 const actor=await requirePermission(operation==='edit'&&can(current,'users.permissions')?'users.permissions':operation==='create'?'users.create':operation==='edit'?'users.edit':operation==='status'?'users.deactivate':operation==='reset'?'users.reset':'users.permissions');
 try{
  if(operation==='create'||operation==='edit')await saveManagedUser(db(),actor,{id:operation==='edit'?String(form.get('id')):undefined,name:form.get('name'),email:form.get('email'),accessRole:form.get('accessRole'),overrides:JSON.parse(String(form.get('overrides')??'{}')),version:String(form.get('version')??'')},String(form.get('password')??''));
  else if(operation==='status'){const active=z.enum(['true','false']).parse(form.get('active'));await setUserActive(db(),actor,String(form.get('id')??''),active==='true');}
  else if(operation==='policy')await saveRolePolicy(db(),actor,String(form.get('accessRole')) as AccessRole,form.getAll('permissions').map(String) as Permission[]);
  else if(operation==='reset'){const token=await issuePasswordReset(db(),actor,String(form.get('id')??''));return {error:'',success:'Single-use password reset created. Expires in 15 minutes.',resetPath:'/reset-password#'+token,requestId:String(form.get('requestId')??'')};}
  else throw new AccessError('Unknown user management action.');
 }catch(error){if(error instanceof AccessError||error instanceof z.ZodError||error instanceof SyntaxError)return {error:error instanceof z.ZodError?error.issues[0].message:error.message,success:'',requestId:String(form.get('requestId')??'')};if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')return {error:'An account with this email already exists.',success:'',requestId:String(form.get('requestId')??'')};throw error;}
 revalidatePath('/admin/users');revalidatePath('/admin');return {error:'',requestId:String(form.get('requestId')??''),success:operation==='status'?'Account status updated. Existing sessions were revoked.':operation==='policy'?'Role defaults updated. Affected users must sign in again.':'Account saved. Updated users must sign in again.'};
}
// Backwards-compatible endpoints still use the same validated, audited service.
export async function createUser(previous:UserResult,form:FormData){const legacy=z.enum(['CHEF','SUPER_USER']).safeParse(form.get('role'));if(!legacy.success)return {error:'Choose a valid role.',success:''};form.set('operation','create');form.set('accessRole',legacy.data==='SUPER_USER'?'SUPER_USER':'HEAD_CHEF');form.set('overrides','{}');return manageUser(previous,form);}
export async function deactivateUser(form:FormData){const actor=await requirePermission('users.deactivate');await setUserActive(db(),actor,String(form.get('id')??''),false);revalidatePath('/admin/users');}
