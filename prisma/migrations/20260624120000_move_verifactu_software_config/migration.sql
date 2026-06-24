CREATE TABLE "VerifactuSoftwareConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "producerName" TEXT NOT NULL,
    "producerTaxId" TEXT NOT NULL,
    "softwareName" TEXT NOT NULL,
    "softwareId" TEXT NOT NULL,
    "softwareVersion" TEXT NOT NULL,
    "installationNumber" TEXT NOT NULL,
    "onlyVerifactu" TEXT NOT NULL,
    "multiTaxpayerUse" TEXT NOT NULL,
    "multipleTaxpayers" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerifactuSoftwareConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VerifactuSoftwareConfig_isDefault_createdAt_idx"
    ON "VerifactuSoftwareConfig"("isDefault", "createdAt");

CREATE UNIQUE INDEX "VerifactuSoftwareConfig_single_default_idx"
    ON "VerifactuSoftwareConfig"("isDefault")
    WHERE "isDefault" = true;

INSERT INTO "VerifactuSoftwareConfig" (
    "producerName",
    "producerTaxId",
    "softwareName",
    "softwareId",
    "softwareVersion",
    "installationNumber",
    "onlyVerifactu",
    "multiTaxpayerUse",
    "multipleTaxpayers",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT
    trim("verifactuSoftwareProducerName"),
    trim("verifactuSoftwareProducerTaxId"),
    trim("verifactuSoftwareName"),
    trim("verifactuSoftwareId"),
    trim("verifactuSoftwareVersion"),
    trim("verifactuSoftwareInstallationNumber"),
    trim("verifactuSoftwareOnlyVerifactu"),
    trim("verifactuSoftwareMultiTaxpayerUse"),
    trim("verifactuSoftwareMultipleTaxpayers"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Organization"
WHERE NULLIF(trim("verifactuSoftwareProducerName"), '') IS NOT NULL
  AND NULLIF(trim("verifactuSoftwareProducerTaxId"), '') IS NOT NULL
  AND NULLIF(trim("verifactuSoftwareName"), '') IS NOT NULL
  AND NULLIF(trim("verifactuSoftwareId"), '') IS NOT NULL
  AND NULLIF(trim("verifactuSoftwareVersion"), '') IS NOT NULL
  AND NULLIF(trim("verifactuSoftwareInstallationNumber"), '') IS NOT NULL
  AND NULLIF(trim("verifactuSoftwareOnlyVerifactu"), '') IS NOT NULL
  AND NULLIF(trim("verifactuSoftwareMultiTaxpayerUse"), '') IS NOT NULL
  AND NULLIF(trim("verifactuSoftwareMultipleTaxpayers"), '') IS NOT NULL;

WITH first_config AS (
    SELECT "id"
    FROM "VerifactuSoftwareConfig"
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 1
)
UPDATE "VerifactuSoftwareConfig"
SET "isDefault" = true
WHERE "id" IN (SELECT "id" FROM first_config);

ALTER TABLE "Organization"
    DROP COLUMN "verifactuSoftwareProducerName",
    DROP COLUMN "verifactuSoftwareProducerTaxId",
    DROP COLUMN "verifactuSoftwareName",
    DROP COLUMN "verifactuSoftwareId",
    DROP COLUMN "verifactuSoftwareVersion",
    DROP COLUMN "verifactuSoftwareInstallationNumber",
    DROP COLUMN "verifactuSoftwareOnlyVerifactu",
    DROP COLUMN "verifactuSoftwareMultiTaxpayerUse",
    DROP COLUMN "verifactuSoftwareMultipleTaxpayers";
