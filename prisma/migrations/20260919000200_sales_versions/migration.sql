-- Optimistic revisions prevent one user's stale form from overwriting another's changes.
ALTER TABLE "WeeklyForecast" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0);
ALTER TABLE "DailySales" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0);
