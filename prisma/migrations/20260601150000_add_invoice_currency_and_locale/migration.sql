ALTER TABLE "Organization"
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en-GB';

ALTER TABLE "Invoice"
  ADD COLUMN "currency" TEXT;

UPDATE "Invoice" i
SET "currency" = COALESCE(
  (
    SELECT s."currency"
    FROM "InvoiceSnapshot" s
    WHERE s."invoiceId" = i."id"
  ),
  o."currency"
)
FROM "Organization" o
WHERE o."id" = i."organizationId";

ALTER TABLE "Invoice"
  ALTER COLUMN "currency" SET NOT NULL;

ALTER TABLE "InvoiceSnapshot"
  DROP COLUMN "currency";
