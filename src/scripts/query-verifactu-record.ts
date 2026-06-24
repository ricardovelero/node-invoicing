import { prisma } from '../db/prisma';
import {
  loadVerifactuQuerySoapConfig,
  persistVerifactuQueryResponse,
  queryVerifactuSoapRecord,
} from '../modules/verifactu/verifactu-query';

export const queryVerifactuRecordInAeatTest = async ({
  recordId,
  client = prisma,
  logger = console,
}: {
  recordId: string;
  client?: typeof prisma;
  logger?: Pick<Console, 'log'>;
}) => {
  if (!recordId) {
    throw new Error('Usage: node dist/scripts/query-verifactu-record.js <verifactuRecordId>');
  }

  const record = await client.verifactuRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      sellerTaxId: true,
      invoiceNumber: true,
      issueDate: true,
      invoice: {
        select: {
          snapshot: {
            select: {
              sellerName: true,
              sellerLegalName: true,
            },
          },
        },
      },
    },
  });

  if (!record) {
    throw new Error(`VerifactuRecord not found: ${recordId}`);
  }

  const sellerLegalName = record.invoice.snapshot?.sellerLegalName ||
    record.invoice.snapshot?.sellerName;

  if (!sellerLegalName) {
    throw new Error(`VerifactuRecord query requires a seller name: ${recordId}`);
  }

  const config = loadVerifactuQuerySoapConfig();
  const result = await queryVerifactuSoapRecord({
    identity: {
      sellerTaxId: record.sellerTaxId,
      sellerLegalName,
      invoiceNumber: record.invoiceNumber,
      issueDate: record.issueDate,
    },
    config,
  });
  const persisted = await persistVerifactuQueryResponse({
    client,
    verifactuRecordId: record.id,
    responseXml: result.responseXml,
  });

  logger.log('[VERIFACTU_AEAT_QUERY_TEST_ENDPOINT]', result.endpoint);
  logger.log('[VERIFACTU_AEAT_QUERY_TEST_REQUEST_XML]', result.requestXml);
  logger.log('[VERIFACTU_AEAT_QUERY_TEST_HTTP_STATUS]', result.httpStatus);
  logger.log('[VERIFACTU_AEAT_QUERY_TEST_RESPONSE_XML]', result.responseXml);
  logger.log('[VERIFACTU_AEAT_QUERY_TEST_PARSED_RESPONSE]', JSON.stringify(persisted.parsed));
  logger.log('[VERIFACTU_AEAT_QUERY_TEST_PERSISTED_STATUS]', persisted.record.status);

  return { result, persisted };
};

const main = async () => {
  await queryVerifactuRecordInAeatTest({ recordId: process.argv[2] ?? '' });
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('[VERIFACTU_AEAT_QUERY_TEST_ERROR]', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
