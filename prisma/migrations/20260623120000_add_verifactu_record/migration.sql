CREATE TYPE "VerifactuRecordStatus" AS ENUM (
  'GENERATED',
  'SUBMISSION_PENDING',
  'SUBMITTED',
  'ACCEPTED',
  'ACCEPTED_WITH_ERRORS',
  'REJECTED'
);

CREATE TABLE "VerifactuRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceFiscalRecordId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "recordType" "InvoiceFiscalRecordType" NOT NULL,
  "sellerTaxId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "previousVerifactuRecordId" UUID,
  "previousSellerTaxId" TEXT,
  "previousInvoiceNumber" TEXT,
  "previousIssueDate" TIMESTAMP(3),
  "previousHuella" TEXT,
  "huella" TEXT NOT NULL,
  "generationDateTimeWithTimezone" TEXT NOT NULL,
  "payloadVersion" TEXT NOT NULL,
  "xml" TEXT NOT NULL,
  "status" "VerifactuRecordStatus" NOT NULL DEFAULT 'GENERATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VerifactuRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VerifactuRecord_invoiceFiscalRecordId_key"
  ON "VerifactuRecord"("invoiceFiscalRecordId");

CREATE UNIQUE INDEX "VerifactuRecord_previousVerifactuRecordId_key"
  ON "VerifactuRecord"("previousVerifactuRecordId");

CREATE UNIQUE INDEX "VerifactuRecord_organizationId_huella_key"
  ON "VerifactuRecord"("organizationId", "huella");

CREATE INDEX "VerifactuRecord_invoiceId_idx"
  ON "VerifactuRecord"("invoiceId");

CREATE INDEX "VerifactuRecord_organizationId_createdAt_idx"
  ON "VerifactuRecord"("organizationId", "createdAt");

CREATE INDEX "VerifactuRecord_status_idx"
  ON "VerifactuRecord"("status");

ALTER TABLE "VerifactuRecord"
  ADD CONSTRAINT "VerifactuRecord_invoiceFiscalRecordId_fkey"
  FOREIGN KEY ("invoiceFiscalRecordId") REFERENCES "InvoiceFiscalRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VerifactuRecord"
  ADD CONSTRAINT "VerifactuRecord_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VerifactuRecord"
  ADD CONSTRAINT "VerifactuRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VerifactuRecord"
  ADD CONSTRAINT "VerifactuRecord_previousVerifactuRecordId_fkey"
  FOREIGN KEY ("previousVerifactuRecordId") REFERENCES "VerifactuRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
