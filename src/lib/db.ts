import 'server-only';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Follow README.md to configure PostgreSQL.');
  const poolSize = Number(process.env.DATABASE_POOL_SIZE ?? '10');
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 50) throw new Error('DATABASE_POOL_SIZE must be between 1 and 50.');
  return globalDb.prisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: poolSize }) });
}
