import type { Prisma } from '@prisma/client';
import {
  currentVerifactuAeatEnvironment,
  verifactuSubsanableStatuses,
} from './verifactu-record';

type VerifactuStatusClient = Pick<
  Prisma.TransactionClient,
  'invoiceFiscalRecord' | 'verifactuRecord'
>;

export const verifactuStatusSelect = {
  id: true,
  status: true,
  aeatEnvironment: true,
  aeatCodigoErrorRegistro: true,
  aeatDescripcionErrorRegistro: true,
  aeatSubmissionResult: true,
  preflightError: true,
  updatedAt: true,
} satisfies Prisma.VerifactuRecordSelect;

// An invoice's Veri*Factu records, newest first, with the fiscal record that
// says whether each is an ALTA, a subsanación or an ANULACION.
export const verifactuHistoryInclude = {
  where: { verifactuRecord: { isNot: null } },
  orderBy: { sequenceNumber: 'desc' },
  select: {
    type: true,
    subsanacionNumber: true,
    verifactuRecord: { select: verifactuStatusSelect },
  },
} satisfies Prisma.InvoiceInclude['fiscalRecords'];

// The CSV is AEAT's receipt code for an accepted submission.
export const verifactuCsvFromResult = (result: Prisma.JsonValue | null) =>
  result && typeof result === 'object' && !Array.isArray(result) &&
    typeof result.csv === 'string'
    ? result.csv
    : null;

// Invoices whose latest Veri*Factu record in the current AEAT environment was
// rejected, accepted with errors or failed pre-flight validation.
export const getVerifactuIssues = async (
  client: VerifactuStatusClient,
  organizationId: string,
) => {
  const aeatEnvironment = currentVerifactuAeatEnvironment();
  const candidates = await client.verifactuRecord.findMany({
    where: { organizationId, aeatEnvironment, status: { in: verifactuSubsanableStatuses } },
    distinct: ['invoiceId'],
    select: { invoiceId: true },
  });

  if (!candidates.length) {
    return [];
  }

  const records = await client.invoiceFiscalRecord.findMany({
    where: {
      organizationId,
      invoiceId: { in: candidates.map((candidate) => candidate.invoiceId) },
      verifactuRecord: { is: { aeatEnvironment } },
    },
    orderBy: { sequenceNumber: 'desc' },
    select: {
      invoiceId: true,
      type: true,
      subsanacionNumber: true,
      invoice: { select: { number: true, issueDate: true } },
      verifactuRecord: { select: verifactuStatusSelect },
    },
  });
  const seenInvoiceIds = new Set<string>();

  return records.filter((record) => {
    if (seenInvoiceIds.has(record.invoiceId)) {
      return false;
    }

    seenInvoiceIds.add(record.invoiceId);

    return !!record.verifactuRecord &&
      verifactuSubsanableStatuses.includes(record.verifactuRecord.status);
  });
};

// Sends an invoice's records that failed pre-flight validation again, as after a
// validator fix. Records AEAT rejected need a subsanación instead.
export const retryVerifactuPreflightFailures = async (
  client: VerifactuStatusClient,
  organizationId: string,
  invoiceId: string,
) => {
  const { count } = await client.verifactuRecord.updateMany({
    where: {
      organizationId,
      invoiceId,
      status: 'PREFLIGHT_FAILED',
      aeatEnvironment: currentVerifactuAeatEnvironment(),
    },
    data: { status: 'GENERATED', preflightError: null },
  });

  return count;
};
