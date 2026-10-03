import type { VerifactuRecordStatus } from '@prisma/client';
import type { prisma } from '../../db/prisma';
import { persistVerifactuQueryResponse, queryVerifactuSoapRecord } from './verifactu-query';
import {
  type VerifactuSoapConfig,
  type VerifactuSoapTransport,
  sendVerifactuSoapRequest,
} from './verifactu-soap';

// Records stay SUBMITTED when AEAT's response had no line for them. Give AEAT
// time to register the submission before asking for its state.
export const verifactuReconciliationMinAgeMinutes = 15;

export const verifactuReconciliationBatchSize = 100;

// Queries AEAT for SUBMITTED records and stores their registered state. Records
// AEAT has not registered go back to GENERATED for the submission worker.
export const reconcileSubmittedVerifactuRecords = async ({
  client,
  config,
  transport = sendVerifactuSoapRequest,
  logger = console,
  now = () => Date.now(),
}: {
  client: typeof prisma;
  config: VerifactuSoapConfig;
  transport?: VerifactuSoapTransport;
  logger?: Pick<Console, 'error'>;
  now?: () => number;
}) => {
  const records = await client.verifactuRecord.findMany({
    where: {
      status: 'SUBMITTED',
      updatedAt: { lt: new Date(now() - verifactuReconciliationMinAgeMinutes * 60_000) },
    },
    orderBy: { updatedAt: 'asc' },
    take: verifactuReconciliationBatchSize,
    select: {
      id: true,
      sellerTaxId: true,
      invoiceNumber: true,
      issueDate: true,
      invoice: {
        select: {
          snapshot: { select: { sellerName: true, sellerLegalName: true } },
        },
      },
    },
  });
  const statuses: Partial<Record<VerifactuRecordStatus, number>> = {};
  let errorCount = 0;

  for (const record of records) {
    try {
      const sellerLegalName = record.invoice.snapshot?.sellerLegalName ||
        record.invoice.snapshot?.sellerName;

      if (!sellerLegalName) {
        throw new Error('VerifactuRecord query requires a seller name.');
      }

      const result = await queryVerifactuSoapRecord({
        identity: {
          sellerTaxId: record.sellerTaxId,
          sellerLegalName,
          invoiceNumber: record.invoiceNumber,
          issueDate: record.issueDate,
        },
        config,
        transport,
      });
      const persisted = await persistVerifactuQueryResponse({
        client,
        verifactuRecordId: record.id,
        responseXml: result.responseXml,
      });

      statuses[persisted.record.status] = (statuses[persisted.record.status] ?? 0) + 1;
    } catch (error) {
      errorCount += 1;
      logger.error('[VERIFACTU_RECONCILE_ERROR]', record.id, error);
    }
  }

  return { checkedCount: records.length, statuses, errorCount };
};
