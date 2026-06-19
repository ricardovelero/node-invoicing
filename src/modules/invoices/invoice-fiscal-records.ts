import { createHash } from 'node:crypto';
import {
  Prisma,
  type InvoiceFiscalRecordType,
  type InvoiceStatus,
} from '@prisma/client';

export const invoiceFiscalRecordHashVersion = 'internal-v1';

type InvoiceFiscalRecordSequenceRow = {
  reservedValue: bigint | number;
};

type CreateInvoiceFiscalRecordOptions = {
  invoiceId: string;
  organizationId: string;
  type: InvoiceFiscalRecordType;
  createdByUserId?: string | null;
};

type CanonicalJsonPrimitive = string | number | boolean | null;
type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

type FiscalRecordHashSnapshot = {
  sellerName: string | null;
  sellerLegalName: string | null;
  sellerTaxId: string | null;
  sellerAddressLine1: string | null;
  sellerCity: string | null;
  sellerCountry: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerTaxId: string | null;
  customerAddressLine1: string | null;
  customerCity: string | null;
  customerCountry: string | null;
};

type BuildFiscalRecordHashInputOptions = {
  recordType: InvoiceFiscalRecordType;
  sequenceNumber: number;
  organizationId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus: InvoiceStatus;
  issueDate: Date | string;
  dueDate: Date | string;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  withholdingType: string | null;
  withholdingRate: Prisma.Decimal | number | string | null;
  withholdingAmountCents: number | null;
  totalCents: number;
  snapshot: FiscalRecordHashSnapshot | null;
  previousHash: string | null;
  hashVersion?: string;
};

const fiscalRecordHashInvoiceSelect = Prisma.validator<Prisma.InvoiceSelect>()({
  id: true,
  organizationId: true,
  number: true,
  status: true,
  issueDate: true,
  dueDate: true,
  currency: true,
  subtotalCents: true,
  discountCents: true,
  taxCents: true,
  withholdingType: true,
  withholdingRate: true,
  withholdingAmountCents: true,
  totalCents: true,
  snapshot: {
    select: {
      sellerName: true,
      sellerLegalName: true,
      sellerTaxId: true,
      sellerAddressLine1: true,
      sellerCity: true,
      sellerCountry: true,
      customerName: true,
      customerEmail: true,
      customerTaxId: true,
      customerAddressLine1: true,
      customerCity: true,
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
});

type FiscalRecordHashInvoice = Prisma.InvoiceGetPayload<{
  select: typeof fiscalRecordHashInvoiceSelect;
}>;

// Code-point key ordering. Must stay in sync with the SQL backfill, which sorts
// object keys with COLLATE "C" so both engines produce the same canonical JSON.
const sortKeys = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

// Canonical date form matches the SQL backfill, which renders timestamps via
// to_char(ts, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'). toISOString() produces exactly
// that UTC, millisecond-precision form for both Date and parseable strings.
const formatCanonicalDate = (value: Date | string) =>
  (value instanceof Date ? value : new Date(value)).toISOString();

// Fiscal hashes must serialize decimals identically to the SQL backfill, which
// renders the Decimal(5, 2) columns via `::text` (always two fractional digits).
// `Decimal.toString()` strips trailing zeros (15.00 -> "15"), so normalize to a
// fixed scale to keep the TS and SQL canonical forms in agreement.
const fiscalRecordDecimalScale = 2;

const formatDecimal = (value: Prisma.Decimal | number | string | null) => {
  if (value === null) {
    return null;
  }

  return new Prisma.Decimal(value).toFixed(fiscalRecordDecimalScale);
};

const canonicalizeJsonValue = (value: unknown): CanonicalJsonValue => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return formatCanonicalDate(value);
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, childValue]) => childValue !== undefined)
        .sort(([left], [right]) => sortKeys(left, right))
        .map(([key, childValue]) => [key, canonicalizeJsonValue(childValue)]),
    );
  }

  if (typeof value === 'number') {
    // The canonical input only carries integer numbers (cents, sequence number),
    // which serialize identically here and in Postgres (int::jsonb::text). This
    // also rejects non-finite values. Fractional amounts must arrive as decimal
    // strings via formatDecimal so the two engines never diverge on numbers.
    if (!Number.isInteger(value)) {
      throw new Error('Fiscal record hash input numbers must be finite integers.');
    }

    return value;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  throw new Error(`Unsupported fiscal record hash input value: ${typeof value}.`);
};

export const canonicalizeFiscalRecordHashInput = (value: unknown) =>
  canonicalizeJsonValue(value);

export const stringifyFiscalRecordHashInput = (value: unknown) =>
  JSON.stringify(canonicalizeJsonValue(value));

export const hashFiscalRecordInput = (value: unknown) =>
  createHash('sha256')
    .update(stringifyFiscalRecordHashInput(value))
    .digest('hex');

export const buildFiscalRecordHashInput = (
  options: BuildFiscalRecordHashInputOptions,
) =>
  ({
    hashVersion: options.hashVersion ?? invoiceFiscalRecordHashVersion,
    organizationId: options.organizationId,
    invoiceId: options.invoiceId,
    invoiceNumber: options.invoiceNumber,
    recordType: options.recordType,
    sequenceNumber: options.sequenceNumber,
    previousHash: options.previousHash,
    invoiceStatus: options.invoiceStatus,
    issueDate: formatCanonicalDate(options.issueDate),
    dueDate: formatCanonicalDate(options.dueDate),
    currency: options.currency,
    subtotalCents: options.subtotalCents,
    discountCents: options.discountCents,
    taxCents: options.taxCents,
    withholdingType: options.withholdingType,
    withholdingRate: formatDecimal(options.withholdingRate),
    withholdingAmountCents: options.withholdingAmountCents,
    totalCents: options.totalCents,
    snapshot: options.snapshot,
  }) satisfies Record<string, unknown>;

const buildFiscalRecordHashInputFromInvoice = ({
  invoice,
  recordType,
  sequenceNumber,
  previousHash,
}: {
  invoice: FiscalRecordHashInvoice;
  recordType: InvoiceFiscalRecordType;
  sequenceNumber: number;
  previousHash: string | null;
}) =>
  buildFiscalRecordHashInput({
    recordType,
    sequenceNumber,
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    invoiceStatus: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    subtotalCents: invoice.snapshot?.subtotalCents ?? invoice.subtotalCents,
    discountCents: invoice.snapshot?.discountCents ?? invoice.discountCents,
    taxCents: invoice.snapshot?.taxCents ?? invoice.taxCents,
    withholdingType: invoice.snapshot?.withholdingType ?? invoice.withholdingType,
    withholdingRate: invoice.snapshot?.withholdingRate ?? invoice.withholdingRate,
    withholdingAmountCents:
      invoice.snapshot?.withholdingAmountCents ?? invoice.withholdingAmountCents,
    totalCents: invoice.snapshot?.totalCents ?? invoice.totalCents,
    snapshot: invoice.snapshot
      ? {
          sellerName: invoice.snapshot.sellerName,
          sellerLegalName: invoice.snapshot.sellerLegalName,
          sellerTaxId: invoice.snapshot.sellerTaxId,
          sellerAddressLine1: invoice.snapshot.sellerAddressLine1,
          sellerCity: invoice.snapshot.sellerCity,
          sellerCountry: invoice.snapshot.sellerCountry,
          customerName: invoice.snapshot.customerName,
          customerEmail: invoice.snapshot.customerEmail,
          customerTaxId: invoice.snapshot.customerTaxId,
          customerAddressLine1: invoice.snapshot.customerAddressLine1,
          customerCity: invoice.snapshot.customerCity,
          customerCountry: invoice.snapshot.customerCountry,
        }
      : null,
    previousHash,
  });

export const nextInvoiceFiscalRecordSequenceNumber = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
) => {
  const rows = await tx.$queryRaw<InvoiceFiscalRecordSequenceRow[]>`
    INSERT INTO "InvoiceFiscalRecordSequence" ("organizationId", "nextValue", "createdAt", "updatedAt")
    VALUES (${organizationId}::uuid, 2, NOW(), NOW())
    ON CONFLICT ("organizationId")
    DO UPDATE SET
      "nextValue" = "InvoiceFiscalRecordSequence"."nextValue" + 1,
      "updatedAt" = NOW()
    RETURNING "nextValue" - 1 AS "reservedValue"
  `;
  const reservedValue = rows[0]?.reservedValue;

  if (reservedValue === undefined) {
    throw new Error('Unable to reserve invoice fiscal record sequence number.');
  }

  return Number(reservedValue);
};

export const createInvoiceFiscalRecord = async (
  tx: Prisma.TransactionClient,
  options: CreateInvoiceFiscalRecordOptions,
) => {
  const sequenceNumber = await nextInvoiceFiscalRecordSequenceNumber(
    tx,
    options.organizationId,
  );
  const previousRecord = await tx.invoiceFiscalRecord.findFirst({
    where: {
      organizationId: options.organizationId,
      sequenceNumber: {
        lt: sequenceNumber,
      },
    },
    orderBy: {
      sequenceNumber: 'desc',
    },
    select: {
      id: true,
      hash: true,
    },
  });
  const previousRecordId = previousRecord?.id ?? null;
  const previousHash = previousRecord?.hash ?? null;

  const invoice = await tx.invoice.findFirst({
    where: {
      id: options.invoiceId,
      organizationId: options.organizationId,
    },
    select: fiscalRecordHashInvoiceSelect,
  });

  if (!invoice) {
    throw new Error('Unable to build invoice fiscal record hash input.');
  }

  const hashInput = canonicalizeFiscalRecordHashInput(
    buildFiscalRecordHashInputFromInvoice({
      invoice,
      recordType: options.type,
      sequenceNumber,
      previousHash,
    }),
  ) as Prisma.InputJsonValue;
  const hash = hashFiscalRecordInput(hashInput);

  return tx.invoiceFiscalRecord.create({
    data: {
      invoiceId: options.invoiceId,
      organizationId: options.organizationId,
      type: options.type,
      sequenceNumber,
      previousRecordId,
      previousHash,
      hash,
      hashInput,
      hashVersion: invoiceFiscalRecordHashVersion,
      createdByUserId: options.createdByUserId ?? null,
    },
  });
};

export type InvoiceFiscalRecordChainIssueReason =
  | 'hashMismatch'
  | 'previousHashMismatch'
  | 'previousRecordMismatch'
  | 'chainStartMismatch'
  | 'chainLinkMissing';

export type InvoiceFiscalRecordChainIssue = {
  recordId: string;
  sequenceNumber: number;
  reason: InvoiceFiscalRecordChainIssueReason;
};

export type VerifyInvoiceFiscalRecordChainResult = {
  ok: boolean;
  organizationId: string;
  recordCount: number;
  issues: InvoiceFiscalRecordChainIssue[];
};

const fiscalRecordChainSelect =
  Prisma.validator<Prisma.InvoiceFiscalRecordSelect>()({
    id: true,
    sequenceNumber: true,
    hash: true,
    previousHash: true,
    previousRecordId: true,
    hashInput: true,
  });

// Walks an organization's append-only fiscal chain in sequence order and
// recomputes each hash from its stored canonical input, flagging tampered
// records and broken links. Read-only, so it accepts the shared client or a
// transaction client.
export const verifyInvoiceFiscalRecordChain = async (
  client: Prisma.TransactionClient,
  organizationId: string,
): Promise<VerifyInvoiceFiscalRecordChainResult> => {
  const records = await client.invoiceFiscalRecord.findMany({
    where: { organizationId },
    orderBy: { sequenceNumber: 'asc' },
    select: fiscalRecordChainSelect,
  });

  const issues: InvoiceFiscalRecordChainIssue[] = [];
  const addIssue = (
    record: { id: string; sequenceNumber: number },
    reason: InvoiceFiscalRecordChainIssueReason,
  ) =>
    issues.push({
      recordId: record.id,
      sequenceNumber: record.sequenceNumber,
      reason,
    });

  records.forEach((record, index) => {
    if (hashFiscalRecordInput(record.hashInput) !== record.hash) {
      addIssue(record, 'hashMismatch');
    }

    const previousRecord = index === 0 ? null : records[index - 1];

    if (!previousRecord) {
      if (record.previousHash !== null || record.previousRecordId !== null) {
        addIssue(record, 'chainStartMismatch');
      }

      return;
    }

    if (record.previousHash === null || record.previousRecordId === null) {
      addIssue(record, 'chainLinkMissing');
      return;
    }

    if (record.previousHash !== previousRecord.hash) {
      addIssue(record, 'previousHashMismatch');
    }

    if (record.previousRecordId !== previousRecord.id) {
      addIssue(record, 'previousRecordMismatch');
    }
  });

  return {
    ok: issues.length === 0,
    organizationId,
    recordCount: records.length,
    issues,
  };
};
