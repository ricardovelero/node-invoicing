import type { Prisma, VerifactuRecordStatus } from '@prisma/client';
import type { VerifactuPayload } from './verifactu-payload';
import {
  parseVerifactuSoapSubmissionResponse,
  verifactuStatusFromSoapSubmission,
} from './verifactu-soap';

export const buildVerifactuRecordData = ({
  payload,
  xml,
  previousVerifactuRecordId = null,
  status = 'GENERATED',
}: {
  payload: VerifactuPayload;
  xml: string;
  previousVerifactuRecordId?: string | null;
  status?: VerifactuRecordStatus;
}): Prisma.VerifactuRecordUncheckedCreateInput => ({
  invoiceFiscalRecordId: payload.fiscalRecordId,
  invoiceId: payload.invoiceId,
  organizationId: payload.organizationId,
  recordType: payload.recordType,
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
}: {
  client: VerifactuSoapSubmissionPersistenceClient;
  verifactuRecordId: string;
  responseXml: string;
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

  if (currentRecord.status === 'ACCEPTED') {
    return {
      skipped: true as const,
      parsed,
      record: {
        id: verifactuRecordId,
        status: currentRecord.status,
        aeatEstadoEnvio: currentRecord.aeatEstadoEnvio,
        aeatEstadoRegistro: currentRecord.aeatEstadoRegistro,
        aeatCodigoErrorRegistro: currentRecord.aeatCodigoErrorRegistro,
        aeatDescripcionErrorRegistro: currentRecord.aeatDescripcionErrorRegistro,
      },
    };
  }

  const firstLine = parsed.kind === 'response' ? parsed.respuestaLinea[0] : undefined;
  const status = verifactuStatusFromSoapSubmission(parsed);
  const record = await client.verifactuRecord.update({
    where: { id: verifactuRecordId },
    data: {
      status,
      aeatSubmissionResponseXml: responseXml,
      aeatSubmissionResult: parsed as Prisma.InputJsonValue,
      aeatEstadoEnvio: parsed.kind === 'response' ? parsed.estadoEnvio : null,
      aeatEstadoRegistro: firstLine?.estadoRegistro ?? null,
      aeatCodigoErrorRegistro: parsed.kind === 'fault'
        ? parsed.faultCode
        : firstLine?.codigoErrorRegistro ?? null,
      aeatDescripcionErrorRegistro: parsed.kind === 'fault'
        ? parsed.faultString
        : firstLine?.descripcionErrorRegistro ?? null,
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
