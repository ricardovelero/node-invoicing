ALTER TABLE "Organization"
  ADD COLUMN "countryCode" TEXT,
  ADD COLUMN "legalForm" TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN "withholdingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "defaultWithholdingType" TEXT,
  ADD COLUMN "defaultWithholdingRate" DECIMAL(5, 2);

ALTER TABLE "Invoice"
  ADD COLUMN "withholdingType" TEXT,
  ADD COLUMN "withholdingRate" DECIMAL(5, 2),
  ADD COLUMN "withholdingAmountCents" INTEGER;

ALTER TABLE "InvoiceSnapshot"
  ADD COLUMN "withholdingType" TEXT,
  ADD COLUMN "withholdingRate" DECIMAL(5, 2),
  ADD COLUMN "withholdingAmountCents" INTEGER;

UPDATE "Organization"
SET
  "withholdingEnabled" = false,
  "defaultWithholdingType" = NULL,
  "defaultWithholdingRate" = NULL
WHERE "countryCode" IS DISTINCT FROM 'ES'
  OR "legalForm" = 'company';
