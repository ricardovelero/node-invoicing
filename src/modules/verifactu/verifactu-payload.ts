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
    verifactuRecord: {
      select: {
        generationDateTimeWithTimezone: true,
      },
    },
    invoiceType: true,
    operationDescription: true,
    taxBreakdown: true,
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

export const verifactuSoftwareConfigSelect =
  Prisma.validator<Prisma.VerifactuSoftwareConfigSelect>()({
    producerName: true,
    producerTaxId: true,
    softwareName: true,
    softwareId: true,
    softwareVersion: true,
    installationNumber: true,
    onlyVerifactu: true,
    multiTaxpayerUse: true,
    multipleTaxpayers: true,
  });

export type VerifactuSoftwareConfigSource = Prisma.VerifactuSoftwareConfigGetPayload<{
  select: typeof verifactuSoftwareConfigSelect;
}>;

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
  previousRecord: VerifactuPreviousRecordIdentity | null;
  softwareConfig: VerifactuSoftwareConfigSource;
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

export class VerifactuPayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerifactuPayloadValidationError';
  }
}

const invalidPayload = (message: string) => new VerifactuPayloadValidationError(message);

const formatIssueDate = (value: Date) => {
  if (Number.isNaN(value.getTime())) {
    throw invalidPayload('VERI*FACTU payload requires a valid invoice issue date.');
  }

  return value.toISOString();
};

const requiredText = (value: string | null | undefined, fieldName: string) => {
  const text = value?.trim();

  if (!text) {
    throw invalidPayload(`VERI*FACTU payload requires ${fieldName}.`);
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
    throw invalidPayload('VERI*FACTU payload requires a generation datetime with timezone.');
  }

  return value;
};

const validateSoftwareFlag = (value: string | null, fieldName: string) => {
  const text = requiredText(value, fieldName);

  if (text !== 'S' && text !== 'N') {
    throw invalidPayload(`VERI*FACTU payload requires ${fieldName} to be S or N.`);
  }

  return text;
};

export const buildVerifactuSoftware = (
  config: VerifactuSoftwareConfigSource,
): VerifactuSoftwareIdentifier => ({
  producerName: requiredText(
    config.producerName,
    'persisted VerifactuSoftwareConfig.producerName',
  ),
  producerTaxId: requiredText(
    config.producerTaxId,
    'persisted VerifactuSoftwareConfig.producerTaxId',
  ),
  name: requiredText(
    config.softwareName,
    'persisted VerifactuSoftwareConfig.softwareName',
  ),
  id: requiredText(
    config.softwareId,
    'persisted VerifactuSoftwareConfig.softwareId',
  ),
  version: requiredText(
    config.softwareVersion,
    'persisted VerifactuSoftwareConfig.softwareVersion',
  ),
  installationNumber: requiredText(
    config.installationNumber,
    'persisted VerifactuSoftwareConfig.installationNumber',
  ),
  onlyVerifactu: validateSoftwareFlag(
    config.onlyVerifactu,
    'persisted VerifactuSoftwareConfig.onlyVerifactu',
  ),
  multiTaxpayerUse: validateSoftwareFlag(
    config.multiTaxpayerUse,
    'persisted VerifactuSoftwareConfig.multiTaxpayerUse',
  ),
  multipleTaxpayers: validateSoftwareFlag(
    config.multipleTaxpayers,
    'persisted VerifactuSoftwareConfig.multipleTaxpayers',
  ),
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

const decimalPattern = /^-?\d+(?:\.\d{1,2})?$/;

const optionalJsonText = (value: unknown, fieldName: string) => {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw invalidPayload(`VERI*FACTU payload requires ${fieldName} to be text or null.`);
  }

  return value.trim() || null;
};

const requiredJsonText = (value: unknown, fieldName: string) => {
  if (typeof value !== 'string') {
    throw invalidPayload(`VERI*FACTU payload requires ${fieldName}.`);
  }

  return requiredText(value, fieldName);
};

const optionalDecimalText = (value: unknown, fieldName: string) => {
  const text = optionalJsonText(value, fieldName);

  if (text !== null && !decimalPattern.test(text)) {
    throw invalidPayload(`VERI*FACTU payload requires ${fieldName} to be a decimal string.`);
  }

  return text;
};

const requiredDecimalText = (value: unknown, fieldName: string) => {
  const text = requiredJsonText(value, fieldName);

  if (!decimalPattern.test(text)) {
    throw invalidPayload(`VERI*FACTU payload requires ${fieldName} to be a decimal string.`);
  }

  return text;
};

const validateTaxBreakdown = (
  value: Prisma.JsonValue | null,
): VerifactuTaxBreakdownItem[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidPayload(
      'VERI*FACTU ALTA payload requires persisted InvoiceFiscalRecord.taxBreakdown ' +
        'as a non-empty array.',
    );
  }

  return value.map((item, index) => {
    const fieldPrefix = `persisted InvoiceFiscalRecord.taxBreakdown[${index}]`;

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw invalidPayload(
        `VERI*FACTU ALTA payload requires ${fieldPrefix} to be an object.`,
      );
    }

    const row = item as Record<string, unknown>;

    return {
      taxType: requiredJsonText(row.taxType, `${fieldPrefix}.taxType`),
      taxRegimeKey: optionalJsonText(row.taxRegimeKey, `${fieldPrefix}.taxRegimeKey`),
      operationClassification: optionalJsonText(
        row.operationClassification,
        `${fieldPrefix}.operationClassification`,
      ),
      exemptOperation: optionalJsonText(row.exemptOperation, `${fieldPrefix}.exemptOperation`),
      taxRate: optionalDecimalText(row.taxRate, `${fieldPrefix}.taxRate`),
      taxableBaseAmount: requiredDecimalText(
        row.taxableBaseAmount,
        `${fieldPrefix}.taxableBaseAmount`,
      ),
      taxAmount: optionalDecimalText(row.taxAmount, `${fieldPrefix}.taxAmount`),
      equivalenceSurchargeRate: optionalDecimalText(
        row.equivalenceSurchargeRate,
        `${fieldPrefix}.equivalenceSurchargeRate`,
      ),
      equivalenceSurchargeAmount: optionalDecimalText(
        row.equivalenceSurchargeAmount,
        `${fieldPrefix}.equivalenceSurchargeAmount`,
      ),
    };
  });
};

const buildAltaFiscalData = (record: InvoiceFiscalRecordWithInvoiceSnapshot) => {
  if (record.type !== 'ALTA') {
    throw invalidPayload('VERI*FACTU ALTA payload requires an ALTA fiscal record.');
  }

  return {
    invoiceType: requiredText(
      record.invoiceType,
      'persisted InvoiceFiscalRecord.invoiceType',
    ),
    operationDescription: requiredText(
      record.operationDescription,
      'persisted InvoiceFiscalRecord.operationDescription',
    ),
    taxBreakdown: validateTaxBreakdown(record.taxBreakdown),
  };
};

type VerifactuPayloadClient = Pick<
  Prisma.TransactionClient,
  'invoiceFiscalRecord' | 'verifactuRecord' | 'verifactuSoftwareConfig'
>;

const previousVerifactuRecordSelect =
  Prisma.validator<Prisma.VerifactuRecordSelect>()({
    id: true,
    sellerTaxId: true,
    invoiceNumber: true,
    issueDate: true,
    huella: true,
  });

type PreviousVerifactuRecord = Prisma.VerifactuRecordGetPayload<{
  select: typeof previousVerifactuRecordSelect;
}>;

const buildPreviousRecordIdentity = (
  previousRecord: PreviousVerifactuRecord | null,
): VerifactuPreviousRecordIdentity | null => previousRecord
  ? {
      sellerTaxId: previousRecord.sellerTaxId,
      invoiceNumber: previousRecord.invoiceNumber,
      issueDate: previousRecord.issueDate.toISOString(),
      huella: previousRecord.huella,
    }
  : null;

export const resolvePreviousVerifactuRecord = async (
  client: VerifactuPayloadClient,
  record: Pick<InvoiceFiscalRecordWithInvoiceSnapshot, 'organizationId' | 'sequenceNumber'>,
) => {
  const previousRecord = await client.verifactuRecord.findFirst({
    where: {
      organizationId: record.organizationId,
      status: { not: 'REJECTED' },
      invoiceFiscalRecord: {
        sequenceNumber: {
          lt: record.sequenceNumber,
        },
      },
    },
    orderBy: {
      invoiceFiscalRecord: {
        sequenceNumber: 'desc',
      },
    },
    select: previousVerifactuRecordSelect,
  });

  return {
    previousVerifactuRecordId: previousRecord?.id ?? null,
    previousRecord: buildPreviousRecordIdentity(previousRecord),
  };
};

export const resolveDefaultVerifactuSoftwareConfig = async (
  client: Pick<Prisma.TransactionClient, 'verifactuSoftwareConfig'>,
) => {
  const config = await client.verifactuSoftwareConfig.findFirst({
    where: { isDefault: true },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    select: verifactuSoftwareConfigSelect,
  });

  if (!config) {
    throw invalidPayload(
      'VERI*FACTU payload requires a default VerifactuSoftwareConfig.',
    );
  }

  return config;
};

const newGenerationDateTimeWithTimezone = () => new Date().toISOString();

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
    software: buildVerifactuSoftware(options.softwareConfig),
    previousRecord,
    generationDateTimeWithTimezone: validateGenerationDateTime(
      options.generationDateTimeWithTimezone,
    ),
    huellaType: '01' as const,
    internalPreviousHash: record.previousHash,
    internalHash: record.hash,
  };

  if (record.type === 'ALTA') {
    const alta = buildAltaFiscalData(record);
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

export const buildVerifactuPayloadForFiscalRecord = async (
  client: VerifactuPayloadClient,
  fiscalRecordId: string,
) => {
  const record = await client.invoiceFiscalRecord.findUnique({
    where: { id: fiscalRecordId },
    select: verifactuPayloadFiscalRecordSelect,
  });

  if (!record) {
    throw new Error('Unable to load invoice fiscal record for VERI*FACTU payload.');
  }

  const previous = await resolvePreviousVerifactuRecord(client, record);
  const softwareConfig = await resolveDefaultVerifactuSoftwareConfig(client);
  const payload = buildVerifactuPayload(record, {
    previousRecord: previous.previousRecord,
    softwareConfig,
    generationDateTimeWithTimezone:
      record.verifactuRecord?.generationDateTimeWithTimezone ??
      newGenerationDateTimeWithTimezone(),
  });

  return {
    payload,
    previousVerifactuRecordId: previous.previousVerifactuRecordId,
  };
};
