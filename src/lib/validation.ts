import { z } from 'zod';
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(12, 'Use at least 12 characters.').max(128);
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100), email: emailSchema,
  password: passwordSchema, role: z.enum(['CHEF', 'SUPER_USER']),
});
