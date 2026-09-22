import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
const pg = new PGlite();
beforeAll(async () => {
  await pg.exec(readFileSync('prisma/migrations/20260919000100_initial/migration.sql', 'utf8'));
  await pg.exec(readFileSync('prisma/migrations/20260919000200_sales_versions/migration.sql', 'utf8'));
  await pg.exec(readFileSync('prisma/migrations/20260920000100_weekly_targets/migration.sql', 'utf8'));
  await pg.exec(readFileSync('prisma/migrations/20260920000200_delivery_planning/migration.sql', 'utf8'));
  await pg.exec(readFileSync('prisma/migrations/20260921000100_actual_closing_total/migration.sql', 'utf8'));
  await pg.exec(readFileSync('prisma/migrations/20260922000100_simple_purchases/migration.sql', 'utf8'));
  await pg.exec(readFileSync('prisma/migrations/20260922000200_packaging_workspace/migration.sql', 'utf8'));
  await pg.exec(readFileSync('prisma/migrations/20260923000100_file_first_invoices/migration.sql', 'utf8'));
  await pg.exec(`INSERT INTO "Restaurant" (id,name) VALUES ('restaurant','Test Kitchen');
    INSERT INTO "Supplier" (id,name,"restaurantId") VALUES ('supplier','Supplier','restaurant');
    INSERT INTO "Product" (id,"restaurantId",name,category,"countingUnit","unitCost","supplierId") VALUES ('chicken','restaurant','Chicken','Meat','kg',8.1234,'supplier');`);
}, 30000);
afterAll(async () => { await pg.close(); });
describe('PostgreSQL migration and financial storage invariants', () => {
  it('persists unassigned invoice drafts but forbids confirming them without a supplier', async () => {
    await pg.exec(`INSERT INTO "PackagingInvoice" (id,"restaurantId","submissionKey","orderDate","deliveryDate","updatedAt") VALUES ('unassigned','restaurant','draft-key','2026-09-21','2026-09-21',now())`);
    const result=await pg.query<{supplierId:string|null}>(`SELECT "supplierId" FROM "PackagingInvoice" WHERE id='unassigned'`);
    expect(result.rows[0].supplierId).toBeNull();
    await expect(pg.exec(`UPDATE "PackagingInvoice" SET status='CONFIRMED',"netPence"=100,"confirmedAt"=now() WHERE id='unassigned'`)).rejects.toThrow(/packaging_confirmed_supplier/);
  });

  it('enforces submission keys independently of browser state', async () => {
    await pg.exec(`INSERT INTO "PurchaseInvoice" (id,"restaurantId","supplierId",reference,"accountingDate","orderDate","amountPence","submissionKey","confirmedAt","updatedAt") VALUES ('simple-one','restaurant','supplier','one','2026-09-21','2026-09-20',2501,'retry-key',now(),now())`);
    await expect(pg.exec(`INSERT INTO "PurchaseInvoice" (id,"restaurantId","supplierId",reference,"accountingDate","amountPence","submissionKey","updatedAt") VALUES ('simple-two','restaurant','supplier','two','2026-09-21',2501,'retry-key',now())`)).rejects.toThrow(/unique/);
  });
  it('allows only one actual-sales record per restaurant and date', async () => {
    await pg.exec(`INSERT INTO "DailySales" (id,"restaurantId",date,"amountPence","updatedAt") VALUES ('sale','restaurant','2026-09-14',140000,now())`);
    await expect(pg.exec(`INSERT INTO "DailySales" (id,"restaurantId",date,"amountPence","updatedAt") VALUES ('duplicate','restaurant','2026-09-14',150000,now())`)).rejects.toThrow(/unique/);
  });
  it('rejects invalid thresholds and non-Monday weeks', async () => {
    await expect(pg.exec(`INSERT INTO "RestaurantSettings" ("restaurantId","targetBps","warningBps","updatedAt") VALUES ('restaurant',2400,2400,now())`)).rejects.toThrow(/settings_thresholds/);
    await expect(pg.exec(`INSERT INTO "WeeklyForecast" (id,"restaurantId","weekStart","targetBps","warningBps","updatedAt") VALUES ('bad','restaurant','2026-09-15',2400,2200,now())`)).rejects.toThrow(/week_monday/);
  });
  it('preserves original forecasts while allowing revised forecasts', async () => {
    await pg.exec(`INSERT INTO "WeeklyForecast" (id,"restaurantId","weekStart","targetBps","warningBps","updatedAt") VALUES ('week','restaurant','2026-09-14',2400,2200,now());
      INSERT INTO "ForecastDay" (id,"weeklyForecastId",date,"originalForecastPence","forecastPence") VALUES ('mon','week','2026-09-14',170000,170000);
      UPDATE "ForecastDay" SET "forecastPence"=180000 WHERE id='mon';`);
    const result = await pg.query<{ originalForecastPence: number }>(`SELECT "originalForecastPence" FROM "ForecastDay" WHERE id='mon'`);
    expect(Number(result.rows[0].originalForecastPence)).toBe(170000);
    await expect(pg.exec(`UPDATE "ForecastDay" SET "originalForecastPence"=180000 WHERE id='mon'`)).rejects.toThrow(/immutable/);
  });
  it('keeps counted prices and values after catalogue price changes', async () => {
    await pg.exec(`INSERT INTO "StockCount" (id,"restaurantId",date,"updatedAt") VALUES ('stock','restaurant','2026-09-20',now());
      INSERT INTO "StockCountItem" (id,"stockCountId","productId","productName","countingUnit",quantity,"unitCost","valuePence") VALUES ('line','stock','chicken','Chicken','kg',2.5,8.1234,2031);
      UPDATE "Product" SET "unitCost"=99.99 WHERE id='chicken';`);
    const result = await pg.query<{ unitCost: string; valuePence: number }>(`SELECT "unitCost","valuePence" FROM "StockCountItem" WHERE id='line'`);
    expect(result.rows[0].unitCost).toBe('8.1234'); expect(Number(result.rows[0].valuePence)).toBe(2031);
  });
  it('makes audit entries append-only', async () => {
    await pg.exec(`INSERT INTO "AuditLog" (id,"restaurantId",action,entity,"entityId") VALUES ('audit','restaurant','TEST','Restaurant','restaurant')`);
    await expect(pg.exec(`DELETE FROM "AuditLog" WHERE id='audit'`)).rejects.toThrow(/append-only/);
    await expect(pg.exec(`UPDATE "AuditLog" SET action='HIDDEN' WHERE id='audit'`)).rejects.toThrow(/append-only/);
  });
  it('enforces one invoice per order, independent of order date', async () => {
    await pg.exec(`INSERT INTO "SupplierOrder" (id,"restaurantId","supplierId","orderDate","expectedDeliveryDate","estimatedAmountPence","updatedAt") VALUES ('order','restaurant','supplier','2026-09-20','2026-09-21',10000,now());
      INSERT INTO "PurchaseInvoice" (id,"restaurantId","supplierId","orderId",reference,"accountingDate","amountPence","updatedAt") VALUES ('invoice','restaurant','supplier','order','INV-1','2026-09-21',12000,now());`);
    await expect(pg.exec(`INSERT INTO "PurchaseInvoice" (id,"restaurantId","supplierId","orderId",reference,"accountingDate","amountPence","updatedAt") VALUES ('duplicate-invoice','restaurant','supplier','order','INV-2','2026-09-21',12000,now())`)).rejects.toThrow(/unique/);
  });
});

describe('weekly target storage protections', () => {
  it('keeps originally assigned targets immutable and validates the week and percentage', async () => {
    await pg.exec(`INSERT INTO "WeeklyTarget" (id,"restaurantId","weekStart","originalBps","targetBps",source,"updatedAt") VALUES ('target','restaurant','2026-09-14',2400,2300,'CUSTOM',now())`);
    await expect(pg.exec(`UPDATE "WeeklyTarget" SET "originalBps"=2300 WHERE id='target'`)).rejects.toThrow(/immutable/);
    await expect(pg.exec(`DELETE FROM "WeeklyTarget" WHERE id='target'`)).rejects.toThrow(/cannot be deleted/);
    await expect(pg.exec(`UPDATE "WeeklyTarget" SET "targetBps"=0 WHERE id='target'`)).rejects.toThrow();
    await expect(pg.exec(`INSERT INTO "WeeklyTarget" (id,"restaurantId","weekStart","originalBps","targetBps",source,"updatedAt") VALUES ('bad-target','restaurant','2026-09-15',2400,2300,'CUSTOM',now())`)).rejects.toThrow();
  });
  it('makes effective-dated defaults append-only', async () => {
    await pg.exec(`INSERT INTO "TargetDefault" (id,"restaurantId","effectiveFrom","targetBps") VALUES ('default','restaurant','2026-09-21',2300)`);
    await expect(pg.exec(`UPDATE "TargetDefault" SET "targetBps"=2200 WHERE id='default'`)).rejects.toThrow(/append-only/);
    await expect(pg.exec(`DELETE FROM "TargetDefault" WHERE id='default'`)).rejects.toThrow(/append-only/);
  });
});
