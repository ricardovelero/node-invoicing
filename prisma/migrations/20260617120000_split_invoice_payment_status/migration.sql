CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

ALTER TABLE "Invoice"
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID';

UPDATE "Invoice"
SET "paymentStatus" = CASE "status"::text
  WHEN 'PARTIALLY_PAID' THEN 'PARTIALLY_PAID'::"PaymentStatus"
  WHEN 'PAID' THEN 'PAID'::"PaymentStatus"
  ELSE 'UNPAID'::"PaymentStatus"
END;

CREATE TYPE "InvoiceStatus_new" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

ALTER TABLE "Invoice"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Invoice"
  ALTER COLUMN "status" TYPE "InvoiceStatus_new"
  USING CASE "status"::text
    WHEN 'DRAFT' THEN 'DRAFT'::"InvoiceStatus_new"
    WHEN 'VOID' THEN 'VOID'::"InvoiceStatus_new"
    ELSE 'ISSUED'::"InvoiceStatus_new"
  END;

DROP TYPE "InvoiceStatus";

ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";

ALTER TABLE "Invoice"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

CREATE INDEX "Invoice_paymentStatus_idx" ON "Invoice"("paymentStatus");
