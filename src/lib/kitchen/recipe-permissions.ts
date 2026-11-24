import 'server-only';
import {requirePermission} from '@/lib/auth';
import type {Permission} from '@/lib/permissions';
export async function requireRecipePublisher(permission:Permission){const user=await requirePermission(permission);if(user.role!=='SUPER_USER')throw new Error('Only Super Users can modify recipes.');return user;}
