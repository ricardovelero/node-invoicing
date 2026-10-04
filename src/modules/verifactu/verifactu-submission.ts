import type {
  InvoiceFiscalRecordType,
  VerifactuAeatEnvironment,
  VerifactuRecordStatus,
} from '@prisma/client';
import type { prisma } from '../../db/prisma';
import { formatVerifactuDate } from './verifactu-huella';
import { isValidSpanishNif } from './verifactu-nif';
import { persistVerifactuSoapSubmissionResponse } from './verifactu-record';
import {
  type ParsedVerifactuSoapSubmission,
  type VerifactuSoapConfig,
  type VerifactuSoapTransport,
  sendVerifactuSoapRequest,
  submitVerifactuSoapXml,
} from './verifactu-soap';
import { validateVerifactuXmlWithXsd } from './verifactu-xml';

// AEAT accepts up to 1000 records per request. A smaller batch keeps the stored
// response XML, which is copied onto every record in the batch, reasonably small.
export const verifactuSubmissionBatchSize = 100;

// AEAT flow control: wait TiempoEsperaEnvio seconds between submissions. The
// same delay is used as the retry back-off after faults and transport errors.
export const verifactuDefaultWaitSeconds = 60;

const pendingStatuses: VerifactuRecordStatus[] = ['GENERATED', 'SUBMISSION_PENDING'];

type VerifactuSubmissionClient = typeof prisma;

type VerifactuBatchRecord = {
  id: string;
  xml: string;
  recordType: InvoiceFiscalRecordType;
  invoiceNumber: string;
  issueDate: Date;
};

// Captures each NIF with its parent element, e.g. ObligadoEmision or RegistroAnterior.
const nifElementPattern = new RegExp(
  '<sf:(\\w+)>(?:<sf:NombreRazon>[^<]*</sf:NombreRazon>)?' +
    '<sf:(?:NIF|IDEmisorFactura|IDEmisorFacturaAnulada)>([^<]*)<',
  'gu',
);

// Catches records AEAT would reject outright before they fault a whole batch.
export const preflightVerifactuRecordXml = async (xml: string) => {
  const errors = [...xml.matchAll(nifElementPattern)]
    .filter(([, , nif]) => !isValidSpanishNif(nif!))
    .map(([, parent, nif]) => `Invalid NIF in ${parent}: ${nif}`);
  const validation = await validateVerifactuXmlWithXsd(xml);

  if (!validation.ok) {
    errors.push(`XSD validation failed: ${validation.error}`);
  }

  return errors;
};

const cabeceraPattern = /<sfLR:Cabecera>[\s\S]*?<\/sfLR:Cabecera>/u;
const registroFacturaPattern = /<sfLR:RegistroFactura>[\s\S]*?<\/sfLR:RegistroFactura>/u;

const extractXmlPart = (xml: string, pattern: RegExp, name: string) => {
  const part = xml.match(pattern)?.[0];

  if (!part) {
    throw new Error(`Stored Veri*Factu XML is missing ${name}.`);
  }

  return part;
};

// Combines stored single-record documents into one RegFactuSistemaFacturacion.
// All records must share the same Cabecera (ObligadoEmision).
export const buildVerifactuBatchXml = (xmls: string[]) => {
  const [firstXml] = xmls;

  if (!firstXml) {
    throw new Error('A Veri*Factu batch needs at least one record.');
  }

  const cabecera = extractXmlPart(firstXml, cabeceraPattern, 'Cabecera');
  const registros = xmls.map((xml) => {
    if (extractXmlPart(xml, cabeceraPattern, 'Cabecera') !== cabecera) {
      throw new Error('Veri*Factu batch records must share the same Cabecera.');
    }

    return extractXmlPart(xml, registroFacturaPattern, 'RegistroFactura');
  });

  return firstXml.replace(
    /<sfLR:Cabecera>[\s\S]*<\/sfLR:RegistroFactura>/u,
    () => cabecera + registros.join(''),
  );
};

const tipoOperacion = (recordType: InvoiceFiscalRecordType) =>
  recordType === 'ANULACION' ? 'Anulacion' : 'Alta';

export const findVerifactuResponseLineIndex = (
  parsed: ParsedVerifactuSoapSubmission,
  record: Pick<VerifactuBatchRecord, 'recordType' | 'invoiceNumber' | 'issueDate'>,
) => {
  if (parsed.kind === 'fault') {
    return -1;
  }

  const fecha = formatVerifactuDate(record.issueDate.toISOString());

  return parsed.respuestaLinea.findIndex((line) =>
    line.idFactura.numSerieFactura === record.invoiceNumber &&
    line.idFactura.fechaExpedicionFactura === fecha &&
    // Operacion text can include nested Subsanacion/RechazoPrevio flags.
    line.operacion?.startsWith(tipoOperacion(record.recordType)));
};

const waitSecondsFromResponse = (parsed: ParsedVerifactuSoapSubmission) => {
  const seconds = parsed.kind === 'response' ? Number(parsed.tiempoEsperaEnvio) : NaN;

  return Number.isFinite(seconds) && seconds > 0 ? seconds : verifactuDefaultWaitSeconds;
};

// Records are sent in fiscal chain order. Records failing pre-flight are marked
// PREFLIGHT_FAILED and left out. The batch stops before the first record whose
// Cabecera differs, so a seller name or NIF change starts a new request.
const loadPendingBatch = async (
  client: VerifactuSubmissionClient,
  organizationId: string,
  aeatEnvironment: VerifactuAeatEnvironment,
) => {
  const records = await client.verifactuRecord.findMany({
    where: { organizationId, aeatEnvironment, status: { in: pendingStatuses } },
    orderBy: { invoiceFiscalRecord: { sequenceNumber: 'asc' } },
    take: verifactuSubmissionBatchSize,
    select: {
      id: true,
      xml: true,
      recordType: true,
      invoiceNumber: true,
      issueDate: true,
    },
  });
  const validRecords: typeof records = [];

  for (const record of records) {
    const errors = await preflightVerifactuRecordXml(record.xml);

    if (!errors.length) {
      validRecords.push(record);
      continue;
    }

    await client.verifactuRecord.update({
      where: { id: record.id },
      data: { status: 'PREFLIGHT_FAILED', preflightError: errors.join('\n') },
    });
  }

  const cabecera = validRecords[0]?.xml.match(cabeceraPattern)?.[0];
  const sameCabeceraCount = validRecords.findIndex(
    (record) => record.xml.match(cabeceraPattern)?.[0] !== cabecera,
  );

  return {
    records: sameCabeceraCount === -1 ? validRecords : validRecords.slice(0, sameCabeceraCount),
    preflightFailedCount: records.length - validRecords.length,
  };
};

// Only records generated for aeatEnvironment are sent, so preproduction records
// never reach AEAT production.
export const submitPendingVerifactuBatch = async ({
  client,
  organizationId,
  aeatEnvironment,
  config,
  transport = sendVerifactuSoapRequest,
}: {
  client: VerifactuSubmissionClient;
  organizationId: string;
  aeatEnvironment: VerifactuAeatEnvironment;
  config: VerifactuSoapConfig;
  transport?: VerifactuSoapTransport;
}) => {
  const { records, preflightFailedCount } = await loadPendingBatch(
    client,
    organizationId,
    aeatEnvironment,
  );

  if (!records.length) {
    return { submittedCount: 0, waitSeconds: 0, faulted: false, preflightFailedCount };
  }

  const result = await submitVerifactuSoapXml({
    regFactuXml: buildVerifactuBatchXml(records.map((record) => record.xml)),
    config,
    transport,
  });

  // A body that is neither a SOAP fault nor an AEAT answer, such as a proxy's
  // 502 page, says nothing about the records. Keep them pending to retry.
  if (result.parsedResponse.kind === 'response' && !result.parsedResponse.estadoEnvio) {
    throw new Error(`Unrecognized AEAT response (HTTP ${result.httpStatus}).`);
  }

  const statuses: Partial<Record<VerifactuRecordStatus, number>> = {};

  for (const record of records) {
    const persisted = await persistVerifactuSoapSubmissionResponse({
      client,
      verifactuRecordId: record.id,
      responseXml: result.responseXml,
      lineIndex: findVerifactuResponseLineIndex(result.parsedResponse, record),
    });

    statuses[persisted.record.status] = (statuses[persisted.record.status] ?? 0) + 1;
  }

  return {
    submittedCount: records.length,
    waitSeconds: waitSecondsFromResponse(result.parsedResponse),
    faulted: result.parsedResponse.kind === 'fault',
    preflightFailedCount,
    httpStatus: result.httpStatus,
    statuses,
  };
};

// One pass over every organization with pending records. nextSubmissionAt keeps
// each organization's AEAT wait window between passes. loadConfig returns the
// SOAP config for an organization, with its own certificate.
export const runVerifactuSubmissionPass = async ({
  client,
  aeatEnvironment,
  loadConfig,
  nextSubmissionAt,
  transport = sendVerifactuSoapRequest,
  logger = console,
  now = () => Date.now(),
}: {
  client: VerifactuSubmissionClient;
  aeatEnvironment: VerifactuAeatEnvironment;
  loadConfig: (organizationId: string) => Promise<VerifactuSoapConfig>;
  nextSubmissionAt: Map<string, number>;
  transport?: VerifactuSoapTransport;
  logger?: Pick<Console, 'log' | 'error'>;
  now?: () => number;
}) => {
  const organizations = await client.verifactuRecord.findMany({
    where: { aeatEnvironment, status: { in: pendingStatuses } },
    distinct: ['organizationId'],
    select: { organizationId: true },
  });
  let submittedCount = 0;

  for (const { organizationId } of organizations) {
    if ((nextSubmissionAt.get(organizationId) ?? 0) > now()) {
      continue;
    }

    try {
      const result = await submitPendingVerifactuBatch({
        client,
        organizationId,
        aeatEnvironment,
        config: await loadConfig(organizationId),
        transport,
      });

      submittedCount += result.submittedCount;
      nextSubmissionAt.set(organizationId, now() + result.waitSeconds * 1000);
      logger.log(
        '[VERIFACTU_WORKER_SUBMITTED]',
        JSON.stringify({ organizationId, ...result }),
      );
    } catch (error) {
      nextSubmissionAt.set(organizationId, now() + verifactuDefaultWaitSeconds * 1000);
      logger.error('[VERIFACTU_WORKER_ERROR]', organizationId, error);
    }
  }

  return { organizationCount: organizations.length, submittedCount };
};
