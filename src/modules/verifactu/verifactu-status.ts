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
  aeatLastQueryEstadoRegistro: true,
  aeatLastQueryCodigoErrorRegistro: true,
  aeatLastQueryDescripcionErrorRegistro: true,
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

// Sends an invoice's latest record again when it failed pre-flight validation,
// as after a validator fix. Earlier failures were superseded by a later record,
// such as a subsanación, and records AEAT rejected need a subsanación instead.
export const retryVerifactuPreflightFailures = async (
  client: VerifactuStatusClient,
  organizationId: string,
  invoiceId: string,
) => {
  const latest = await client.invoiceFiscalRecord.findFirst({
    where: {
      organizationId,
      invoiceId,
      verifactuRecord: { is: { aeatEnvironment: currentVerifactuAeatEnvironment() } },
    },
    orderBy: { sequenceNumber: 'desc' },
    select: { verifactuRecord: { select: { id: true, status: true } } },
  });

  if (latest?.verifactuRecord?.status !== 'PREFLIGHT_FAILED') {
    return 0;
  }

  const { count } = await client.verifactuRecord.updateMany({
    where: { id: latest.verifactuRecord.id, status: 'PREFLIGHT_FAILED' },
    data: { status: 'GENERATED', preflightError: null },
  });

  return count;
};
