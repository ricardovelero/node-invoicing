import { Prisma } from '@prisma/client';
import {
  currentVerifactuAeatEnvironment,
  verifactuSubsanableStatuses,
} from './verifactu-record';

type VerifactuStatusClient = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'invoiceFiscalRecord' | 'verifactuRecord'
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

// Ids of the records that make an invoice an issue: its latest Veri*Factu record
// in the current AEAT environment was rejected, accepted with errors or failed
// pre-flight validation. Only invoices that ever had such a record are checked,
// and the latest record per invoice is picked in the database.
export const getVerifactuIssueRecordIds = async (
  client: Pick<VerifactuStatusClient, '$queryRaw'>,
  organizationId: string,
) => {
  const aeatEnvironment = currentVerifactuAeatEnvironment();
  const statuses = Prisma.sql`${verifactuSubsanableStatuses}::"VerifactuRecordStatus"[]`;
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM (
      SELECT DISTINCT ON (vr."invoiceId") vr."id", vr."status"
      FROM "VerifactuRecord" vr
      JOIN "InvoiceFiscalRecord" fr ON fr."id" = vr."invoiceFiscalRecordId"
      WHERE vr."aeatEnvironment" = ${aeatEnvironment}::"VerifactuAeatEnvironment"
        AND vr."invoiceId" IN (
          SELECT "invoiceId" FROM "VerifactuRecord"
          WHERE "organizationId" = ${organizationId}::uuid
            AND "aeatEnvironment" = ${aeatEnvironment}::"VerifactuAeatEnvironment"
            AND "status" = ANY(${statuses})
        )
      ORDER BY vr."invoiceId", fr."sequenceNumber" DESC
    ) latest
    WHERE latest."status" = ANY(${statuses})
  `;

  return rows.map((row) => row.id);
};

export const getVerifactuIssues = async (
  client: VerifactuStatusClient,
  organizationId: string,
) => {
  const recordIds = await getVerifactuIssueRecordIds(client, organizationId);

  if (!recordIds.length) {
    return [];
  }

  return client.invoiceFiscalRecord.findMany({
    where: { organizationId, verifactuRecord: { is: { id: { in: recordIds } } } },
    orderBy: { sequenceNumber: 'desc' },
    select: {
      invoiceId: true,
      type: true,
      subsanacionNumber: true,
      invoice: { select: { number: true, issueDate: true } },
      verifactuRecord: { select: verifactuStatusSelect },
    },
  });
};

// Sends an invoice's latest record again when it failed pre-flight validation,
// as after a validator fix. Earlier failures were superseded by a later record,
// such as a subsanación, and records AEAT rejected need a subsanación instead.
// Run it holding the invoice's row lock, as subsanaciones are created under it.
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
