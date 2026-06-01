CREATE TABLE "InvoiceSnapshot" (
  "invoiceId" UUID NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT,
  "customerTaxId" TEXT,
  "customerAddressLine1" TEXT,
  "customerCity" TEXT,
  "customerCountry" TEXT,
  "sellerName" TEXT NOT NULL,
  "sellerLegalName" TEXT,
  "sellerTaxId" TEXT,
  "sellerAddressLine1" TEXT,
  "sellerCity" TEXT,
  "sellerCountry" TEXT,
  "currency" TEXT NOT NULL,
  "paymentInstructions" TEXT,
  "subtotalCents" INTEGER NOT NULL,
  "discountCents" INTEGER NOT NULL,
  "taxCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvoiceSnapshot_pkey" PRIMARY KEY ("invoiceId")
);

ALTER TABLE "InvoiceSnapshot"
  ADD CONSTRAINT "InvoiceSnapshot_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "InvoiceSnapshot" (
  "invoiceId",
  "customerName",
  "customerEmail",
  "customerTaxId",
  "customerAddressLine1",
  "customerCity",
  "customerCountry",
  "sellerName",
  "sellerLegalName",
  "sellerTaxId",
  "sellerAddressLine1",
  "sellerCity",
  "sellerCountry",
  "currency",
  "paymentInstructions",
  "subtotalCents",
  "discountCents",
  "taxCents",
  "totalCents",
  "createdAt"
)
SELECT
  i."id",
  c."name",
  c."email",
  c."taxId",
  c."addressLine1",
  c."city",
  c."country",
  o."name",
  o."legalName",
  o."taxId",
  o."addressLine1",
  o."city",
  o."country",
  o."currency",
  o."paymentInstructions",
  i."subtotalCents",
  i."discountCents",
  i."taxCents",
  i."totalCents",
  CURRENT_TIMESTAMP
FROM "Invoice" i
JOIN "Customer" c ON c."id" = i."customerId"
JOIN "Organization" o ON o."id" = i."organizationId"
WHERE i."status" <> 'DRAFT';
