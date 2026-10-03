ALTER TYPE "VerifactuRecordStatus" ADD VALUE 'PREFLIGHT_FAILED';

ALTER TABLE "VerifactuRecord" ADD COLUMN "preflightError" TEXT;
