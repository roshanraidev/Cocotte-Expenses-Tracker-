import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('applies the additive Zonal migration without changing existing sales and enforces import integrity', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(readFileSync('prisma/migrations/20260919000100_initial/migration.sql', 'utf8'));
    await pg.exec(`INSERT INTO "Restaurant" (id,name) VALUES ('restaurant','Cocotte'); INSERT INTO "User" (id,"restaurantId",name,email,"passwordHash","updatedAt") VALUES ('u','restaurant','Operator','operator@example.test','not-a-real-password-hash',now()); INSERT INTO "DailySales" (id,"restaurantId",date,"amountPence","updatedAt") VALUES ('s','restaurant','2026-11-03',12345,now())`);
    await pg.exec(readFileSync('prisma/migrations/20261104000100_zonal_sales_pilot/migration.sql', 'utf8'));
    const sale = await pg.query<{ amountPence: number }>(`SELECT "amountPence" FROM "DailySales" WHERE id='s'`);
    expect(Number(sale.rows[0].amountPence)).toBe(12345);
    await pg.exec(`INSERT INTO "ZonalImport" (id,"restaurantId","actorId",date,branch,source,payload,fingerprint,"salesVersion") VALUES ('preview','restaurant','u','2026-11-03','Test branch','ZONAL_MANUAL','{}','test',0)`);
    await expect(pg.exec(`UPDATE "ZonalImport" SET status='INVALID' WHERE id='preview'`)).rejects.toThrow();
    await expect(pg.exec(`UPDATE "ZonalImport" SET "restaurantId"='unknown' WHERE id='preview'`)).rejects.toThrow();
    await expect(pg.exec(`DELETE FROM "User" WHERE id='u'`)).rejects.toThrow();
  } finally { await pg.close(); }
}, 30000);
