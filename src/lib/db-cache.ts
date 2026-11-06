// Keep one pool across development reloads, but never reuse a client generated
// for an older schema. No credentials or database contents belong in this key.
export type ClientCache<T>={prisma?:T;prismaSchemaSignature?:string};
export function schemaClient<T extends {$disconnect:()=>Promise<void>}>(cache:ClientCache<T>,signature:string,create:()=>T):T{
 if(cache.prisma&&cache.prismaSchemaSignature===signature)return cache.prisma;
 const previous=cache.prisma;
 const current=create();
 cache.prisma=current;
 cache.prismaSchemaSignature=signature;
 if(previous)void previous.$disconnect().catch(()=>{/* Retired pool; never log database connection details. */});
 return current;
}
