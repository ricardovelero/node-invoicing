import { Prisma, type VerifactuAeatEnvironment } from '@prisma/client';
import QRCode from 'qrcode';
import { formatVerifactuDate } from './verifactu-huella';

// Source: vendor/aeat/verifactu/docs/DetalleEspecificacTecnCodigoQRfactura_v0.5.0.pdf
// sections 2-6.

const verifactuQrBaseUrls = {
  test: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
  production: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
} as const;

export const verifactuQrSourceSelect = Prisma.validator<Prisma.VerifactuRecordSelect>()({
  aeatEnvironment: true,
  sellerTaxId: true,
  invoiceNumber: true,
  issueDate: true,
  xml: true,
});

// The invoice's latest ALTA record, a subsanación if any, is encoded in the QR.
// Its status tells the invoice page whether a subsanación can be generated.
export const verifactuQrRecordsInclude = {
  where: { recordType: 'ALTA' },
  orderBy: { invoiceFiscalRecord: { sequenceNumber: 'desc' } },
  select: { ...verifactuQrSourceSelect, status: true },
  take: 1,
} satisfies Prisma.InvoiceInclude['verifactuRecords'];

export type VerifactuQrSource = Prisma.VerifactuRecordGetPayload<{
  select: typeof verifactuQrSourceSelect;
}>;

export type VerifactuQr = {
  url: string;
  svg: string;
};

// The QR points to the AEAT environment the record was generated for.
export const verifactuQrBaseUrl = (aeatEnvironment: VerifactuAeatEnvironment) =>
  aeatEnvironment === 'PRODUCTION'
    ? verifactuQrBaseUrls.production
    : verifactuQrBaseUrls.test;

// Read the amount from the registered XML so the QR always matches what AEAT holds.
const importeTotalFromXml = (xml: string) => {
  const importeTotal = xml.match(/<sf:ImporteTotal>([^<]+)<\/sf:ImporteTotal>/)?.[1];

  if (!importeTotal) {
    throw new Error('VERI*FACTU QR requires ImporteTotal in the stored record XML.');
  }

  return importeTotal;
};

export const buildVerifactuQrUrl = (record: VerifactuQrSource) => {
  const params = new URLSearchParams({
    nif: record.sellerTaxId,
    numserie: record.invoiceNumber,
    fecha: formatVerifactuDate(record.issueDate.toISOString()),
    importe: importeTotalFromXml(record.xml),
  });

  return `${verifactuQrBaseUrl(record.aeatEnvironment)}?${params.toString()}`;
};

export const buildVerifactuQr = async (
  record: VerifactuQrSource | null | undefined,
): Promise<VerifactuQr | null> => {
  if (!record) {
    return null;
  }

  const url = buildVerifactuQrUrl(record);
  // The quiet zone is drawn by the template so its size can be set in millimetres.
  const svg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
  });

  return { url, svg };
};
