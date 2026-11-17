import { describe,it,expect,vi } from 'vitest';
import { schemaClient,type ClientCache } from '@/lib/db-cache';
describe('Prisma schema-aware development pool cache',()=>{
 it('replaces an unversioned pre-migration client that lacks new model delegates',async()=>{
  const old={$disconnect:vi.fn().mockResolvedValue(undefined)};
  const fresh={...old,$disconnect:vi.fn().mockResolvedValue(undefined),zonalSyncBatch:{findMany:vi.fn().mockResolvedValue([])}};
  const cache:ClientCache<typeof old>={prisma:old};
  expect(schemaClient(cache,'schema-with-batches',()=>fresh)).toBe(fresh);
  expect(old.$disconnect).toHaveBeenCalledOnce();
  expect(await fresh.zonalSyncBatch.findMany()).toEqual([]);
 });
 it('reuses the same pool on ordinary reloads with unchanged generated schema',()=>{
  const create=vi.fn(()=>({$disconnect:vi.fn().mockResolvedValue(undefined)})),cache={};
  const first=schemaClient(cache,'same',create);
  expect(schemaClient(cache,'same',create)).toBe(first);
  expect(create).toHaveBeenCalledOnce();expect(first.$disconnect).not.toHaveBeenCalled();
 });
 it('retires a generated client after model or field metadata changes',()=>{
  const create=vi.fn(()=>({$disconnect:vi.fn().mockResolvedValue(undefined)})),cache={};
  const first=schemaClient(cache,'before',create),next=schemaClient(cache,'after',create);
  expect(next).not.toBe(first);expect(first.$disconnect).toHaveBeenCalledOnce();
  expect(schemaClient(cache,'after',create)).toBe(next);expect(create).toHaveBeenCalledTimes(2);
 });
 it('retains the old cache if replacement construction fails',()=>{
  const old={$disconnect:vi.fn().mockResolvedValue(undefined)},cache={prisma:old,prismaSchemaSignature:'old'};
  expect(()=>schemaClient(cache,'new',()=>{throw new Error('configuration invalid');})).toThrow('configuration invalid');
  expect(cache.prisma).toBe(old);expect(old.$disconnect).not.toHaveBeenCalled();
 });
});
