import { Prisma } from '@prisma/client';

export const verifactuPayloadFiscalRecordSelect =
  Prisma.validator<Prisma.InvoiceFiscalRecordSelect>()({
    id: true,
    organizationId: true,
    invoiceId: true,
    type: true,
    sequenceNumber: true,
    previousHash: true,
    hash: true,
    invoice: {
      select: {
        id: true,
        organizationId: true,
        number: true,
        issueDate: true,
        currency: true,
        snapshot: {
          select: {
            sellerName: true,
            sellerLegalName: true,
            sellerTaxId: true,
            sellerCountry: true,
            customerName: true,
            customerTaxId: true,
            customerCountry: true,
            subtotalCents: true,
            discountCents: true,
            taxCents: true,
            withholdingType: true,
            withholdingRate: true,
            withholdingAmountCents: true,
            totalCents: true,
          },
        },
      },
    },
  });

export type InvoiceFiscalRecordWithInvoiceSnapshot = Prisma.InvoiceFiscalRecordGetPayload<{
  select: typeof verifactuPayloadFiscalRecordSelect;
}>;

type VerifactuBasePayload = {
  fiscalRecordId: string;
  organizationId: string;
  invoiceId: string;
  invoiceNumber: string;
  issueDate: string;
  sellerTaxId: string;
  sellerLegalName: string;
  sellerCountry: string | null;
  internalPreviousHash: string | null;
};

export type VerifactuAltaPayload = VerifactuBasePayload & {
  recordType: 'ALTA';
  customerName: string;
  customerTaxId: string | null;
  customerCountry: string | null;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  withholdingType: string | null;
  withholdingRate: string | null;
  withholdingAmountCents: number | null;
  totalCents: number;
  internalFiscalSequenceNumber: number;
  internalHash: string;
};

export type VerifactuAnulacionPayload = VerifactuBasePayload & {
  recordType: 'ANULACION';
  cancellationSequenceNumber: number;
  internalHash: string;
};

export type VerifactuPayload = VerifactuAltaPayload | VerifactuAnulacionPayload;

const formatIssueDate = (value: Date) => {
  if (Number.isNaN(value.getTime())) {
    throw new Error('VERI*FACTU payload requires a valid invoice issue date.');
  }

  return value.toISOString();
};

const requiredText = (value: string | null | undefined, fieldName: string) => {
  const text = value?.trim();

  if (!text) {
    throw new Error(`VERI*FACTU payload requires ${fieldName}.`);
  }

  return text;
};

const formatDecimal = (value: Prisma.Decimal | number | string | null) => {
  if (value === null) {
    return null;
  }

  return new Prisma.Decimal(value).toFixed(2);
};

export const buildVerifactuPayload = (
  record: InvoiceFiscalRecordWithInvoiceSnapshot,
): VerifactuPayload => {
  const snapshot = record.invoice.snapshot;

  if (!snapshot) {
    throw new Error('VERI*FACTU payload requires an invoice snapshot.');
  }

  const invoiceNumber = requiredText(
    record.invoice.number,
    'an invoice number',
  );
  const sellerTaxId = requiredText(snapshot.sellerTaxId, 'a seller tax ID');
  const sellerLegalName = requiredText(
    snapshot.sellerLegalName ?? snapshot.sellerName,
    'a seller legal or display name',
  );
  const basePayload = {
    fiscalRecordId: record.id,
    organizationId: record.organizationId,
    invoiceId: record.invoiceId,
    invoiceNumber,
    issueDate: formatIssueDate(record.invoice.issueDate),
    sellerTaxId,
    sellerLegalName,
    sellerCountry: snapshot.sellerCountry,
    internalPreviousHash: record.previousHash,
  } satisfies VerifactuBasePayload;

  if (record.type === 'ALTA') {
    return {
      ...basePayload,
      recordType: 'ALTA',
      customerName: snapshot.customerName,
      customerTaxId: snapshot.customerTaxId,
      customerCountry: snapshot.customerCountry,
      currency: record.invoice.currency,
      subtotalCents: snapshot.subtotalCents,
      discountCents: snapshot.discountCents,
      taxCents: snapshot.taxCents,
      withholdingType: snapshot.withholdingType,
      withholdingRate: formatDecimal(snapshot.withholdingRate),
      withholdingAmountCents: snapshot.withholdingAmountCents,
      totalCents: snapshot.totalCents,
      internalFiscalSequenceNumber: record.sequenceNumber,
      internalHash: record.hash,
    };
  }

  if (record.type === 'ANULACION') {
    return {
      ...basePayload,
      recordType: 'ANULACION',
      cancellationSequenceNumber: record.sequenceNumber,
      internalHash: record.hash,
    };
  }

  throw new Error(`Unsupported VERI*FACTU fiscal record type: ${record.type}.`);
};
