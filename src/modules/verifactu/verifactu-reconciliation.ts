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
// loadConfig returns the SOAP config for an organization, with its certificate.
export const reconcileSubmittedVerifactuRecords = async ({
  client,
  loadConfig,
  transport = sendVerifactuSoapRequest,
  logger = console,
  now = () => Date.now(),
}: {
  client: typeof prisma;
  loadConfig: (organizationId: string) => Promise<VerifactuSoapConfig>;
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
      organizationId: true,
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
  const configs = new Map<string, Promise<VerifactuSoapConfig>>();
  let errorCount = 0;

  for (const record of records) {
    try {
      const sellerLegalName = record.invoice.snapshot?.sellerLegalName ||
        record.invoice.snapshot?.sellerName;

      if (!sellerLegalName) {
        throw new Error('VerifactuRecord query requires a seller name.');
      }

      if (!configs.has(record.organizationId)) {
        configs.set(record.organizationId, loadConfig(record.organizationId));
      }

      const result = await queryVerifactuSoapRecord({
        identity: {
          sellerTaxId: record.sellerTaxId,
          sellerLegalName,
          invoiceNumber: record.invoiceNumber,
          issueDate: record.issueDate,
        },
        config: await configs.get(record.organizationId)!,
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
