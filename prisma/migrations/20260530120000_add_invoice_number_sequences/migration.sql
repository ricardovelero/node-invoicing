-- CreateTable
CREATE TABLE "InvoiceNumberSequence" (
  "organizationId" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvoiceNumberSequence_pkey" PRIMARY KEY ("organizationId", "year")
);

-- Backfill sequence state from existing invoice numbers that match INV-YYYY-NNNN.
INSERT INTO "InvoiceNumberSequence" ("organizationId", "year", "nextValue", "createdAt", "updatedAt")
SELECT
  "organizationId",
  substring("number" from '^INV-([0-9]{4})-[0-9]{4}$')::integer AS "year",
  max(substring("number" from '^INV-[0-9]{4}-([0-9]{4})$')::integer) + 1 AS "nextValue",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Invoice"
WHERE "number" ~ '^INV-[0-9]{4}-[0-9]{4}$'
GROUP BY "organizationId", substring("number" from '^INV-([0-9]{4})-[0-9]{4}$')::integer;

-- CreateIndex
CREATE INDEX "InvoiceNumberSequence_organizationId_idx" ON "InvoiceNumberSequence"("organizationId");

-- AddForeignKey
ALTER TABLE "InvoiceNumberSequence" ADD CONSTRAINT "InvoiceNumberSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
