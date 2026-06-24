import { prisma } from '../db/prisma';
import {
  loadVerifactuSoapConfig,
  submitVerifactuSoapXml,
} from '../modules/verifactu/verifactu-soap';
import { persistVerifactuSoapSubmissionResponse } from '../modules/verifactu/verifactu-record';
import { validateVerifactuXmlWithXsd } from '../modules/verifactu/verifactu-xml';

const recordId = process.argv[2];

const main = async () => {
  if (!recordId) {
    throw new Error('Usage: node dist/scripts/submit-verifactu-record.js <verifactuRecordId>');
  }

  const record = await prisma.verifactuRecord.findUnique({
    where: { id: recordId },
    select: { id: true, xml: true },
  });

  if (!record) {
    throw new Error(`VerifactuRecord not found: ${recordId}`);
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
    client: prisma,
    verifactuRecordId: record.id,
    responseXml: result.responseXml,
  });

  console.log('[VERIFACTU_AEAT_TEST_ENDPOINT]', result.endpoint);
  console.log('[VERIFACTU_AEAT_TEST_REQUEST_XML]', result.requestXml);
  console.log('[VERIFACTU_AEAT_TEST_HTTP_STATUS]', result.httpStatus);
  console.log('[VERIFACTU_AEAT_TEST_RESPONSE_XML]', result.responseXml);
  console.log('[VERIFACTU_AEAT_TEST_PARSED_RESPONSE]', JSON.stringify(persisted.parsed));
  console.log('[VERIFACTU_AEAT_TEST_PERSISTED_STATUS]', persisted.record.status);
  console.log('[VERIFACTU_AEAT_TEST_PERSIST_SKIPPED]', persisted.skipped);
};

main()
  .catch((error) => {
    console.error('[VERIFACTU_AEAT_TEST_ERROR]', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
