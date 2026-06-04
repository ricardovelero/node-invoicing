ALTER TABLE "Invoice"
  ADD COLUMN "paymentInstructions" TEXT;

UPDATE "Invoice" i
SET "paymentInstructions" = o."paymentInstructions"
FROM "Organization" o
WHERE o."id" = i."organizationId";
