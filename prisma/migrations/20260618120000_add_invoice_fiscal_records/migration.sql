CREATE TYPE "InvoiceFiscalRecordType" AS ENUM ('ALTA', 'ANULACION');

ALTER TABLE "Invoice"
  ADD COLUMN "replacesInvoiceId" UUID;

CREATE TABLE "InvoiceFiscalRecordSequence" (
  "organizationId" UUID NOT NULL,
  "nextValue" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InvoiceFiscalRecordSequence_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "InvoiceFiscalRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "type" "InvoiceFiscalRecordType" NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvoiceFiscalRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_replacesInvoiceId_key"
  ON "Invoice"("replacesInvoiceId");

CREATE UNIQUE INDEX "InvoiceFiscalRecord_invoiceId_type_key"
  ON "InvoiceFiscalRecord"("invoiceId", "type");

CREATE UNIQUE INDEX "InvoiceFiscalRecord_organizationId_sequenceNumber_key"
  ON "InvoiceFiscalRecord"("organizationId", "sequenceNumber");

CREATE INDEX "InvoiceFiscalRecord_invoiceId_idx"
  ON "InvoiceFiscalRecord"("invoiceId");

CREATE INDEX "InvoiceFiscalRecord_organizationId_createdAt_idx"
  ON "InvoiceFiscalRecord"("organizationId", "createdAt");

CREATE INDEX "InvoiceFiscalRecord_createdByUserId_idx"
  ON "InvoiceFiscalRecord"("createdByUserId");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_replacesInvoiceId_fkey"
  FOREIGN KEY ("replacesInvoiceId")
  REFERENCES "Invoice"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "InvoiceFiscalRecordSequence"
  ADD CONSTRAINT "InvoiceFiscalRecordSequence_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "InvoiceFiscalRecord"
  ADD CONSTRAINT "InvoiceFiscalRecord_invoiceId_fkey"
  FOREIGN KEY ("invoiceId")
  REFERENCES "Invoice"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "InvoiceFiscalRecord"
  ADD CONSTRAINT "InvoiceFiscalRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "InvoiceFiscalRecord"
  ADD CONSTRAINT "InvoiceFiscalRecord_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId")
  REFERENCES "User"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
