import 'server-only';
import { PrismaClient, Prisma } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { schemaClient,type ClientCache } from './db-cache';
const globalDb = globalThis as unknown as ClientCache<PrismaClient>;
// Public generated model/field metadata changes when prisma generate adds models
// or scalar fields. HMR alone does not replace globalThis.prisma.
const schemaSignature=JSON.stringify([Prisma.ModelName,Object.entries(Prisma).filter(([name])=>name.endsWith('ScalarFieldEnum')).sort(([a],[b])=>a.localeCompare(b))]);
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Follow README.md to configure PostgreSQL.');
  const poolSize = Number(process.env.DATABASE_POOL_SIZE ?? '10');
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 50) throw new Error('DATABASE_POOL_SIZE must be between 1 and 50.');
  return schemaClient(globalDb,schemaSignature,()=>new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: poolSize }) }));
}
