import type {
  Prisma,
  VerifactuAeatEnvironment,
  VerifactuRecordStatus,
} from '@prisma/client';
import type { VerifactuPayload } from './verifactu-payload';
import {
  parseVerifactuSoapSubmissionResponse,
  verifactuStatusFromSoapSubmission,
} from './verifactu-soap';

// Records an ALTA de subsanación can correct: errors reported by AEAT and records
// that never reached AEAT because they failed pre-flight validation.
const verifactuSubsanableStatuses: VerifactuRecordStatus[] = [
  'ACCEPTED_WITH_ERRORS',
  'REJECTED',
  'PREFLIGHT_FAILED',
];

// The AEAT environment new records are generated for. Anything but production
// is preproduction, so a missing setting never sends records for real.
export const currentVerifactuAeatEnvironment = (
  envSource: NodeJS.ProcessEnv = process.env,
): VerifactuAeatEnvironment =>
  envSource.VERIFACTU_AEAT_ENV === 'production' ? 'PRODUCTION' : 'TEST';

// Records from another AEAT environment, such as preproduction records after
// going live, can't be corrected: AEAT in this environment never received them.
export const canSubsanarVerifactuRecord = (
  record: { status: VerifactuRecordStatus; aeatEnvironment: VerifactuAeatEnvironment } |
    null | undefined,
  envSource: NodeJS.ProcessEnv = process.env,
) =>
  !!record &&
  record.aeatEnvironment === currentVerifactuAeatEnvironment(envSource) &&
  verifactuSubsanableStatuses.includes(record.status);

export const buildVerifactuRecordData = ({
  payload,
  xml,
  aeatEnvironment,
  previousVerifactuRecordId = null,
  status = 'GENERATED',
}: {
  payload: VerifactuPayload;
  xml: string;
  aeatEnvironment: VerifactuAeatEnvironment;
  previousVerifactuRecordId?: string | null;
  status?: VerifactuRecordStatus;
}): Prisma.VerifactuRecordUncheckedCreateInput => ({
  invoiceFiscalRecordId: payload.fiscalRecordId,
  invoiceId: payload.invoiceId,
  organizationId: payload.organizationId,
  recordType: payload.recordType,
  aeatEnvironment,
  sellerTaxId: payload.sellerTaxId,
  invoiceNumber: payload.invoiceNumber,
  issueDate: new Date(payload.issueDate),
  previousVerifactuRecordId,
  previousSellerTaxId: payload.previousRecord?.sellerTaxId ?? null,
  previousInvoiceNumber: payload.previousRecord?.invoiceNumber ?? null,
  previousIssueDate: payload.previousRecord
    ? new Date(payload.previousRecord.issueDate)
    : null,
  previousHuella: payload.previousRecord?.huella ?? null,
  huella: payload.huella,
  generationDateTimeWithTimezone: payload.generationDateTimeWithTimezone,
  payloadVersion: payload.payloadVersion,
  xml,
  status,
});

export type VerifactuSoapSubmissionPersistenceClient = {
  verifactuRecord: {
    findUnique: (args: {
      where: { id: string };
      select: {
        status: true;
        aeatEstadoEnvio: true;
        aeatEstadoRegistro: true;
        aeatCodigoErrorRegistro: true;
        aeatDescripcionErrorRegistro: true;
      };
    }) => Promise<{
      status: VerifactuRecordStatus;
      aeatEstadoEnvio: string | null;
      aeatEstadoRegistro: string | null;
      aeatCodigoErrorRegistro: string | null;
      aeatDescripcionErrorRegistro: string | null;
    } | null>;
    update: (args: {
      where: { id: string };
      data: Prisma.VerifactuRecordUpdateInput;
      select: {
        id: true;
        status: true;
        aeatEstadoEnvio: true;
        aeatEstadoRegistro: true;
        aeatCodigoErrorRegistro: true;
        aeatDescripcionErrorRegistro: true;
      };
    }) => Promise<{
      id: string;
      status: VerifactuRecordStatus;
      aeatEstadoEnvio: string | null;
      aeatEstadoRegistro: string | null;
      aeatCodigoErrorRegistro: string | null;
      aeatDescripcionErrorRegistro: string | null;
    }>;
  };
};

export const persistVerifactuSoapSubmissionResponse = async ({
  client,
  verifactuRecordId,
  responseXml,
  lineIndex = 0,
}: {
  client: VerifactuSoapSubmissionPersistenceClient;
  verifactuRecordId: string;
  responseXml: string;
  // Batched submissions answer with one RespuestaLinea per record.
  lineIndex?: number;
}) => {
  const parsed = parseVerifactuSoapSubmissionResponse(responseXml);
  const currentRecord = await client.verifactuRecord.findUnique({
    where: { id: verifactuRecordId },
    select: {
      status: true,
      aeatEstadoEnvio: true,
      aeatEstadoRegistro: true,
      aeatCodigoErrorRegistro: true,
      aeatDescripcionErrorRegistro: true,
    },
  });

  if (!currentRecord) {
    throw new Error(`VerifactuRecord not found: ${verifactuRecordId}`);
  }

  const line = parsed.kind === 'response' ? parsed.respuestaLinea[lineIndex] : undefined;
  const status = verifactuStatusFromSoapSubmission(parsed, lineIndex);
  const nextStatus = status === null ||
    (currentRecord.status === 'ACCEPTED' && status === 'REJECTED')
    ? currentRecord.status
    : status;
  const record = await client.verifactuRecord.update({
    where: { id: verifactuRecordId },
    data: {
      status: nextStatus,
      aeatSubmissionResponseXml: responseXml,
      aeatSubmissionResult: parsed as Prisma.InputJsonValue,
      aeatEstadoEnvio: parsed.kind === 'response' ? parsed.estadoEnvio : null,
      aeatEstadoRegistro: line?.estadoRegistro ?? null,
      aeatCodigoErrorRegistro: parsed.kind === 'fault'
        ? parsed.faultCode
        : line?.codigoErrorRegistro ?? null,
      aeatDescripcionErrorRegistro: parsed.kind === 'fault'
        ? parsed.faultString
        : line?.descripcionErrorRegistro ?? null,
    },
    select: {
      id: true,
      status: true,
      aeatEstadoEnvio: true,
      aeatEstadoRegistro: true,
      aeatCodigoErrorRegistro: true,
      aeatDescripcionErrorRegistro: true,
    },
  });

  return {
    skipped: false as const,
    parsed,
    record,
  };
};
