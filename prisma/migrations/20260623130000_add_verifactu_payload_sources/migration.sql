ALTER TABLE "Organization"
  ADD COLUMN "verifactuSoftwareProducerName" TEXT,
  ADD COLUMN "verifactuSoftwareProducerTaxId" TEXT,
  ADD COLUMN "verifactuSoftwareName" TEXT,
  ADD COLUMN "verifactuSoftwareId" TEXT,
  ADD COLUMN "verifactuSoftwareVersion" TEXT,
  ADD COLUMN "verifactuSoftwareInstallationNumber" TEXT,
  ADD COLUMN "verifactuSoftwareOnlyVerifactu" TEXT,
  ADD COLUMN "verifactuSoftwareMultiTaxpayerUse" TEXT,
  ADD COLUMN "verifactuSoftwareMultipleTaxpayers" TEXT;

ALTER TABLE "InvoiceFiscalRecord"
  ADD COLUMN "invoiceType" TEXT,
  ADD COLUMN "operationDescription" TEXT,
  ADD COLUMN "taxBreakdown" JSONB;
