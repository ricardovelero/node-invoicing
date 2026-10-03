-- AlterTable
ALTER TABLE "InvoiceFiscalRecord" ADD COLUMN "subsanacionNumber" INTEGER NOT NULL DEFAULT 0;

-- DropIndex
DROP INDEX "InvoiceFiscalRecord_invoiceId_type_key";

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceFiscalRecord_invoiceId_type_subsanacionNumber_key" ON "InvoiceFiscalRecord"("invoiceId", "type", "subsanacionNumber");
