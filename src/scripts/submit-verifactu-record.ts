import { prisma } from '../db/prisma';
import {
  loadVerifactuSoapConfig,
  submitVerifactuSoapXml,
} from '../modules/verifactu/verifactu-soap';
import { persistVerifactuSoapSubmissionResponse } from '../modules/verifactu/verifactu-record';
import { validateVerifactuXmlWithXsd } from '../modules/verifactu/verifactu-xml';

export const submitVerifactuRecordToAeatTest = async ({
  recordId,
  client = prisma,
  logger = console,
}: {
  recordId: string;
  client?: typeof prisma;
  logger?: Pick<Console, 'log'>;
}) => {
  if (!recordId) {
    throw new Error('Usage: node dist/scripts/submit-verifactu-record.js <verifactuRecordId>');
  }

  const record = await client.verifactuRecord.findUnique({
    where: { id: recordId },
    select: { id: true, xml: true, status: true },
  });

  if (!record) {
    throw new Error(`VerifactuRecord not found: ${recordId}`);
  }

  if (record.status === 'ACCEPTED') {
    logger.log('[VERIFACTU_AEAT_TEST_SKIP]', `VerifactuRecord already ACCEPTED: ${record.id}`);

    return { skipped: true as const, record };
  }

  const validation = await validateVerifactuXmlWithXsd(record.xml);

  if (!validation.ok) {
    throw new Error(`Stored Veri*Factu XML is not XSD-valid: ${validation.error}`);
  }

  const config = loadVerifactuSoapConfig();
  const result = await submitVerifactuSoapXml({
    regFactuXml: record.xml,
    config,
  });
  const persisted = await persistVerifactuSoapSubmissionResponse({
    client,
    verifactuRecordId: record.id,
    responseXml: result.responseXml,
  });

  logger.log('[VERIFACTU_AEAT_TEST_ENDPOINT]', result.endpoint);
  logger.log('[VERIFACTU_AEAT_TEST_REQUEST_XML]', result.requestXml);
  logger.log('[VERIFACTU_AEAT_TEST_HTTP_STATUS]', result.httpStatus);
  logger.log('[VERIFACTU_AEAT_TEST_RESPONSE_XML]', result.responseXml);
  logger.log('[VERIFACTU_AEAT_TEST_PARSED_RESPONSE]', JSON.stringify(persisted.parsed));
  logger.log('[VERIFACTU_AEAT_TEST_PERSISTED_STATUS]', persisted.record.status);
  logger.log('[VERIFACTU_AEAT_TEST_PERSIST_SKIPPED]', persisted.skipped);

  return { skipped: false as const, result, persisted };
};

const main = async () => {
  await submitVerifactuRecordToAeatTest({ recordId: process.argv[2] ?? '' });
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('[VERIFACTU_AEAT_TEST_ERROR]', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
