import type { Prisma, VerifactuRecordStatus } from '@prisma/client';
import type { VerifactuPayload } from './verifactu-payload';

export const buildVerifactuRecordData = ({
  payload,
  xml,
  previousVerifactuRecordId = null,
  status = 'GENERATED',
}: {
  payload: VerifactuPayload;
  xml: string;
  previousVerifactuRecordId?: string | null;
  status?: VerifactuRecordStatus;
}): Prisma.VerifactuRecordUncheckedCreateInput => ({
  invoiceFiscalRecordId: payload.fiscalRecordId,
  invoiceId: payload.invoiceId,
  organizationId: payload.organizationId,
  recordType: payload.recordType,
  sellerTaxId: payload.sellerTaxId,
  invoiceNumber: payload.invoiceNumber,
  issueDate: new Date(payload.issueDate),
  previousVerifactuRecordId,
  previousSellerTaxId: payload.previousRecord?.sellerTaxId ?? null,
  previousInvoiceNumber: payload.previousRecord?.invoiceNumber ?? null,
  previousIssueDate: payload.previousRecord
    ? new Date(payload.previousRecord.issueDate)
    : null,
  previousHuella: payload.previousRecord?.huella ?? null,
  huella: payload.huella,
  generationDateTimeWithTimezone: payload.generationDateTimeWithTimezone,
  payloadVersion: payload.payloadVersion,
  xml,
  status,
});
