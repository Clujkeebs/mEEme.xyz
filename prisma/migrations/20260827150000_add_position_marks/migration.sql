-- Persist the sweep's mark on each open position.
--
-- All nullable with no default: a position that has never been swept has no
-- mark, and the dashboard has to be able to tell that apart from a mark of
-- zero. Backfilling would mean inventing prices.
ALTER TABLE "Position" ADD COLUMN "markPriceUsd" DOUBLE PRECISION;
ALTER TABLE "Position" ADD COLUMN "markedAt" TIMESTAMP(3);
ALTER TABLE "Position" ADD COLUMN "markVerdict" TEXT;
ALTER TABLE "Position" ADD COLUMN "markCoilScore" DOUBLE PRECISION;
ALTER TABLE "Position" ADD COLUMN "markStopUsd" DOUBLE PRECISION;
ALTER TABLE "Position" ADD COLUMN "markNextRungUsd" DOUBLE PRECISION;
ALTER TABLE "Position" ADD COLUMN "markNextRungFraction" DOUBLE PRECISION;
