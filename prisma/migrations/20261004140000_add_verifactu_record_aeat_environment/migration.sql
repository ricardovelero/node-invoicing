-- CreateEnum
CREATE TYPE "VerifactuAeatEnvironment" AS ENUM ('TEST', 'PRODUCTION');

-- AlterTable
-- Existing records were all generated for AEAT preproduction.
ALTER TABLE "VerifactuRecord" ADD COLUMN "aeatEnvironment" "VerifactuAeatEnvironment" NOT NULL DEFAULT 'TEST';
