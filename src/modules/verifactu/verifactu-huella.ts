import { createHash } from 'node:crypto';

type VerifactuHuellaPayload = {
  recordType: 'ALTA' | 'ANULACION';
  sellerTaxId: string;
  invoiceNumber: string;
  issueDate: string;
  previousRecord: { huella: string } | null;
  generationDateTimeWithTimezone: string;
} & (
  | {
      recordType: 'ALTA';
      invoiceType: string;
      taxAmount: string;
      totalAmount: string;
    }
  | {
      recordType: 'ANULACION';
    }
);

export const formatVerifactuDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('VERI*FACTU requires a valid date.');
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear());

  return `${day}-${month}-${year}`;
};

const sourceEntry = (key: string, value: string) => `${key}=${value}`;

export const buildVerifactuHuellaSource = (payload: VerifactuHuellaPayload) => {
  const previousHuella = payload.previousRecord?.huella;
  const entries = payload.recordType === 'ALTA'
    ? [
        sourceEntry('IDEmisorFactura', payload.sellerTaxId),
        sourceEntry('NumSerieFactura', payload.invoiceNumber),
        sourceEntry('FechaExpedicionFactura', formatVerifactuDate(payload.issueDate)),
        sourceEntry('TipoFactura', payload.invoiceType),
        sourceEntry('CuotaTotal', payload.taxAmount),
        sourceEntry('ImporteTotal', payload.totalAmount),
      ]
    : [
        sourceEntry('IDEmisorFacturaAnulada', payload.sellerTaxId),
        sourceEntry('NumSerieFacturaAnulada', payload.invoiceNumber),
        sourceEntry('FechaExpedicionFacturaAnulada', formatVerifactuDate(payload.issueDate)),
      ];

  if (previousHuella) {
    entries.push(sourceEntry('Huella', previousHuella));
  }

  entries.push(
    sourceEntry('FechaHoraHusoGenRegistro', payload.generationDateTimeWithTimezone),
  );

  return entries.join('&');
};

export const calculateVerifactuHuella = (payload: VerifactuHuellaPayload) =>
  createHash('sha256')
    .update(buildVerifactuHuellaSource(payload), 'utf8')
    .digest('hex')
    .toUpperCase();
