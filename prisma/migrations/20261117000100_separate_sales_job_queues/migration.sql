-- Queue-only index change. No data or financial-table changes.
-- Create replacement protections before removing the over-broad old index.
CREATE UNIQUE INDEX "ZonalSalesJob_one_active_kind" ON "ZonalSalesJob"("restaurantId","kind") WHERE "status" IN ('QUEUED','RUNNING','PAUSED');
CREATE UNIQUE INDEX "ZonalSalesJob_one_running" ON "ZonalSalesJob"("restaurantId") WHERE "status"='RUNNING';
DROP INDEX "ZonalSalesJob_one_active";
