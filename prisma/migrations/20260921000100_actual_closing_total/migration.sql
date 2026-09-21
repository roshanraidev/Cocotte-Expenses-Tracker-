ALTER TABLE "WeeklyForecast" ADD COLUMN "actualClosingStockPence" BIGINT;
ALTER TABLE "WeeklyForecast" ADD CONSTRAINT "actual_closing_nonnegative" CHECK ("actualClosingStockPence" IS NULL OR "actualClosingStockPence" >= 0);
