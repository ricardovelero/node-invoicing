-- CreateEnum
CREATE TYPE "OrganizationFiscalRegime" AS ENUM ('VERIFACTU', 'SII', 'FORAL');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "fiscalRegime" "OrganizationFiscalRegime" NOT NULL DEFAULT 'VERIFACTU';

-- CreateTable
CREATE TABLE "VerifactuCertificate" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "encryptedPayload" BYTEA NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderNif" TEXT,
    "isSeal" BOOLEAN NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerifactuCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerifactuCertificate_organizationId_key" ON "VerifactuCertificate"("organizationId");

-- AddForeignKey
ALTER TABLE "VerifactuCertificate" ADD CONSTRAINT "VerifactuCertificate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
