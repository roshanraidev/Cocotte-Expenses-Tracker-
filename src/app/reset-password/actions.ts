'use server';
import {z} from 'zod';
import {db} from '@/lib/db';
import {consumePasswordReset} from '@/lib/password-reset';
import {AccessError} from '@/lib/access';
export async function resetPassword(_: {error:string;success:string},form:FormData){try{if(form.get('password')!==form.get('confirm'))return {error:'Passwords must match.',success:''};await consumePasswordReset(db(),String(form.get('token')??''),String(form.get('password')??''));return {error:'',success:'Password updated. Sign in using your new password.'};}catch(error){if(error instanceof AccessError||error instanceof z.ZodError)return {error:error instanceof z.ZodError?error.issues[0].message:error.message,success:''};return {error:'Unable to complete the reset. Request a new link from your Super User.',success:''};}}
