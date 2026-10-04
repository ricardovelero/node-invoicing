-- "other" already behaved like "sole_trader" (anything but "company" can use IRPF).
UPDATE "Organization" SET "legalForm" = 'sole_trader' WHERE "legalForm" NOT IN ('sole_trader', 'company');

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "legalForm" SET DEFAULT 'sole_trader';
