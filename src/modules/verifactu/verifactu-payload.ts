import { Prisma } from '@prisma/client';
import { calculateVerifactuHuella } from './verifactu-huella';

export const verifactuPayloadVersion = '1.0';

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

export type VerifactuSoftwareIdentifier = {
  producerName: string;
  producerTaxId: string;
  name: string;
  id: string;
  version: string;
  installationNumber: string;
  onlyVerifactu: 'S' | 'N';
  multiTaxpayerUse: 'S' | 'N';
  multipleTaxpayers: 'S' | 'N';
};

export type VerifactuPreviousRecordIdentity = {
  sellerTaxId: string;
  invoiceNumber: string;
  issueDate: string;
  huella: string;
};

export type VerifactuCustomerIdentity = {
  name: string;
  nif: string | null;
};

export type VerifactuTaxBreakdownItem = {
  taxType: string;
  taxRegimeKey: string | null;
  operationClassification: string | null;
  exemptOperation: string | null;
  taxRate: string | null;
  taxableBaseAmount: string;
  taxAmount: string | null;
  equivalenceSurchargeRate: string | null;
  equivalenceSurchargeAmount: string | null;
};

export type BuildVerifactuPayloadOptions = {
  generationDateTimeWithTimezone: string;
  software: VerifactuSoftwareIdentifier;
  previousRecord: VerifactuPreviousRecordIdentity | null;
  alta?: {
    invoiceType: string;
    operationDescription: string;
    taxBreakdown: VerifactuTaxBreakdownItem[];
  };
};

type VerifactuBasePayload = {
  payloadVersion: typeof verifactuPayloadVersion;
  fiscalRecordId: string;
  organizationId: string;
  invoiceId: string;
  invoiceNumber: string;
  issueDate: string;
  sellerTaxId: string;
  sellerLegalName: string;
  sellerCountry: string | null;
  software: VerifactuSoftwareIdentifier;
  previousRecord: VerifactuPreviousRecordIdentity | null;
  generationDateTimeWithTimezone: string;
  huellaType: '01';
  huella: string;
  internalPreviousHash: string | null;
  internalHash: string;
};

export type VerifactuAltaPayload = VerifactuBasePayload & {
  recordType: 'ALTA';
  customer: VerifactuCustomerIdentity;
  customerCountry: string | null;
  currency: string;
  invoiceType: string;
  operationDescription: string;
  taxBreakdown: VerifactuTaxBreakdownItem[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  withholdingType: string | null;
  withholdingRate: string | null;
  withholdingAmountCents: number | null;
  totalCents: number;
  taxAmount: string;
  totalAmount: string;
  internalFiscalSequenceNumber: number;
};

export type VerifactuAnulacionPayload = VerifactuBasePayload & {
  recordType: 'ANULACION';
  cancellationSequenceNumber: number;
};

export type VerifactuPayload = VerifactuAltaPayload | VerifactuAnulacionPayload;

export const missingVerifactuSourceFields = [
  {
    field: 'software.*',
    shouldLiveIn: 'Organization compliance/profile settings',
    reason: 'SistemaInformatico is mandatory in RegistroAlta and RegistroAnulacion.',
  },
  {
    field: 'operationDescription',
    shouldLiveIn: 'Invoice fiscal snapshot',
    reason: 'DescripcionOperacion is mandatory in RegistroAlta.',
  },
  {
    field: 'invoiceType',
    shouldLiveIn: 'Invoice fiscal snapshot',
    reason: 'TipoFactura is mandatory and cannot be inferred safely.',
  },
  {
    field: 'taxBreakdown[]',
    shouldLiveIn: 'Invoice fiscal snapshot line/tax summary',
    reason: 'Desglose requires explicit tax type, regime, classification and amounts.',
  },
  {
    field: 'previousRecord',
    shouldLiveIn: 'VerifactuRecord chain',
    reason: 'RegistroAnterior must point to the previous Veri*Factu record identity.',
  },
  {
    field: 'generationDateTimeWithTimezone',
    shouldLiveIn: 'VerifactuRecord',
    reason: 'FechaHoraHusoGenRegistro is mandatory and must include timezone.',
  },
] as const;

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

const centsToAmount = (value: number) => (value / 100).toFixed(2);

const validateGenerationDateTime = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('VERI*FACTU payload requires a generation datetime with timezone.');
  }

  return value;
};

const validateSoftware = (software: VerifactuSoftwareIdentifier) => ({
  producerName: requiredText(software.producerName, 'a software producer name'),
  producerTaxId: requiredText(software.producerTaxId, 'a software producer tax ID'),
  name: requiredText(software.name, 'a software name'),
  id: requiredText(software.id, 'a software ID'),
  version: requiredText(software.version, 'a software version'),
  installationNumber: requiredText(
    software.installationNumber,
    'a software installation number',
  ),
  onlyVerifactu: software.onlyVerifactu,
  multiTaxpayerUse: software.multiTaxpayerUse,
  multipleTaxpayers: software.multipleTaxpayers,
});

const validatePreviousRecord = (
  previousRecord: VerifactuPreviousRecordIdentity | null,
) => {
  if (!previousRecord) {
    return null;
  }

  return {
    sellerTaxId: requiredText(previousRecord.sellerTaxId, 'a previous seller tax ID'),
    invoiceNumber: requiredText(previousRecord.invoiceNumber, 'a previous invoice number'),
    issueDate: requiredText(previousRecord.issueDate, 'a previous issue date'),
    huella: requiredText(previousRecord.huella, 'a previous VERI*FACTU huella'),
  };
};

const validateAltaOptions = (options: BuildVerifactuPayloadOptions) => {
  if (!options.alta) {
    throw new Error('VERI*FACTU ALTA payload requires ALTA fiscal details.');
  }

  if (options.alta.taxBreakdown.length === 0) {
    throw new Error('VERI*FACTU ALTA payload requires at least one tax breakdown item.');
  }

  return {
    invoiceType: requiredText(options.alta.invoiceType, 'an invoice type'),
    operationDescription: requiredText(
      options.alta.operationDescription,
      'an operation description',
    ),
    taxBreakdown: options.alta.taxBreakdown,
  };
};

export const buildVerifactuPayload = (
  record: InvoiceFiscalRecordWithInvoiceSnapshot,
  options: BuildVerifactuPayloadOptions,
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
  const previousRecord = validatePreviousRecord(options.previousRecord);
  const basePayload = {
    payloadVersion: verifactuPayloadVersion as typeof verifactuPayloadVersion,
    fiscalRecordId: record.id,
    organizationId: record.organizationId,
    invoiceId: record.invoiceId,
    invoiceNumber,
    issueDate: formatIssueDate(record.invoice.issueDate),
    sellerTaxId,
    sellerLegalName,
    sellerCountry: snapshot.sellerCountry,
    software: validateSoftware(options.software),
    previousRecord,
    generationDateTimeWithTimezone: validateGenerationDateTime(
      options.generationDateTimeWithTimezone,
    ),
    huellaType: '01' as const,
    internalPreviousHash: record.previousHash,
    internalHash: record.hash,
  };

  if (record.type === 'ALTA') {
    const alta = validateAltaOptions(options);
    const payloadWithoutHuella = {
      ...basePayload,
      recordType: 'ALTA' as const,
      customer: {
        name: snapshot.customerName,
        nif: snapshot.customerTaxId,
      },
      customerCountry: snapshot.customerCountry,
      currency: record.invoice.currency,
      invoiceType: alta.invoiceType,
      operationDescription: alta.operationDescription,
      taxBreakdown: alta.taxBreakdown,
      subtotalCents: snapshot.subtotalCents,
      discountCents: snapshot.discountCents,
      taxCents: snapshot.taxCents,
      withholdingType: snapshot.withholdingType,
      withholdingRate: formatDecimal(snapshot.withholdingRate),
      withholdingAmountCents: snapshot.withholdingAmountCents,
      totalCents: snapshot.totalCents,
      taxAmount: centsToAmount(snapshot.taxCents),
      totalAmount: centsToAmount(snapshot.totalCents),
      internalFiscalSequenceNumber: record.sequenceNumber,
    };

    return {
      ...payloadWithoutHuella,
      huella: calculateVerifactuHuella(payloadWithoutHuella),
    };
  }

  if (record.type === 'ANULACION') {
    const payloadWithoutHuella = {
      ...basePayload,
      recordType: 'ANULACION' as const,
      cancellationSequenceNumber: record.sequenceNumber,
    };

    return {
      ...payloadWithoutHuella,
      huella: calculateVerifactuHuella(payloadWithoutHuella),
    };
  }

  throw new Error(`Unsupported VERI*FACTU fiscal record type: ${record.type}.`);
};
