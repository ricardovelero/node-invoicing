import type { Prisma } from '@prisma/client';
import {
  buildVerifactuPayload,
  verifactuPayloadFiscalRecordSelect,
  type VerifactuAltaPayload,
  type VerifactuAnulacionPayload,
  type VerifactuPayload,
} from './verifactu-payload';

export const verifactuSuministroLRNamespace =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
export const verifactuSuministroInformacionNamespace =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

const verifactuVersion = '1.0';
const verifactuPreviewLogPrefix = '[VERIFACTU_XML_PREVIEW]';
const verifactuPreviewErrorLogPrefix = '[VERIFACTU_XML_PREVIEW_ERROR]';

type VerifactuXmlPreviewLogger = Pick<typeof console, 'log' | 'error'>;

type VerifactuPreviewClient = Pick<Prisma.TransactionClient, 'invoiceFiscalRecord'>;

export const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const element = (name: string, value: string | number) =>
  `<${name}>${escapeXml(String(value))}</${name}>`;

const optionalElement = (name: string, value: string | number | null) =>
  value === null ? '' : element(name, value);

const formatDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('VERI*FACTU XML requires a valid issue date.');
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear());

  return `${day}-${month}-${year}`;
};

const centsToAmount = (value: number) => (value / 100).toFixed(2);

const taxableBaseCents = (payload: VerifactuAltaPayload) =>
  payload.subtotalCents - payload.discountCents;

const taxRateFromAmounts = (payload: VerifactuAltaPayload) => {
  const baseCents = taxableBaseCents(payload);

  if (baseCents <= 0 || payload.taxCents <= 0) {
    return null;
  }

  return ((payload.taxCents / baseCents) * 100).toFixed(2);
};

const buildObligadoEmisionXml = (payload: VerifactuPayload) =>
  '<sfLR:Cabecera>' +
  '<sf:ObligadoEmision>' +
  element('sf:NombreRazon', payload.sellerLegalName) +
  element('sf:NIF', payload.sellerTaxId) +
  '</sf:ObligadoEmision>' +
  '</sfLR:Cabecera>';

const buildIdFacturaAltaXml = (payload: VerifactuAltaPayload) =>
  '<sf:IDFactura>' +
  element('sf:IDEmisorFactura', payload.sellerTaxId) +
  element('sf:NumSerieFactura', payload.invoiceNumber) +
  element('sf:FechaExpedicionFactura', formatDate(payload.issueDate)) +
  '</sf:IDFactura>';

const buildIdFacturaAnulacionXml = (payload: VerifactuAnulacionPayload) =>
  '<sf:IDFactura>' +
  element('sf:IDEmisorFacturaAnulada', payload.sellerTaxId) +
  element('sf:NumSerieFacturaAnulada', payload.invoiceNumber) +
  element('sf:FechaExpedicionFacturaAnulada', formatDate(payload.issueDate)) +
  '</sf:IDFactura>';

const buildDestinatariosXml = (payload: VerifactuAltaPayload) => {
  if (!payload.customerTaxId) {
    return '';
  }

  return '<sf:Destinatarios>' +
    '<sf:IDDestinatario>' +
    element('sf:NombreRazon', payload.customerName) +
    element('sf:NIF', payload.customerTaxId) +
    '</sf:IDDestinatario>' +
    '</sf:Destinatarios>';
};

const buildDesgloseXml = (payload: VerifactuAltaPayload) => {
  const taxRate = taxRateFromAmounts(payload);

  return '<sf:Desglose>' +
    '<sf:DetalleDesglose>' +
    element('sf:Impuesto', '01') +
    element('sf:ClaveRegimen', '01') +
    element('sf:CalificacionOperacion', 'S1') +
    optionalElement('sf:TipoImpositivo', taxRate) +
    element('sf:BaseImponibleOimporteNoSujeto', centsToAmount(taxableBaseCents(payload))) +
    optionalElement(
      'sf:CuotaRepercutida',
      payload.taxCents > 0 ? centsToAmount(payload.taxCents) : null,
    ) +
    '</sf:DetalleDesglose>' +
    '</sf:Desglose>';
};

const buildEncadenamientoXml = (payload: VerifactuPayload) => {
  if (!payload.internalPreviousHash) {
    return '<sf:Encadenamiento>' +
      element('sf:PrimerRegistro', 'S') +
      '</sf:Encadenamiento>';
  }

  return '<sf:Encadenamiento>' +
    '<sf:RegistroAnterior>' +
    element('sf:IDEmisorFactura', payload.sellerTaxId) +
    element('sf:NumSerieFactura', payload.invoiceNumber) +
    element('sf:FechaExpedicionFactura', formatDate(payload.issueDate)) +
    element('sf:Huella', payload.internalPreviousHash) +
    '</sf:RegistroAnterior>' +
    '</sf:Encadenamiento>';
};

const buildSistemaInformaticoXml = (payload: VerifactuPayload) =>
  '<sf:SistemaInformatico>' +
  element('sf:NombreRazon', payload.sellerLegalName) +
  element('sf:NIF', payload.sellerTaxId) +
  element('sf:NombreSistemaInformatico', 'Asienta') +
  element('sf:IdSistemaInformatico', 'AS') +
  element('sf:Version', '0.1') +
  element('sf:NumeroInstalacion', payload.organizationId) +
  element('sf:TipoUsoPosibleSoloVerifactu', 'S') +
  element('sf:TipoUsoPosibleMultiOT', 'N') +
  element('sf:IndicadorMultiplesOT', 'N') +
  '</sf:SistemaInformatico>';

const buildRegistroAltaXml = (payload: VerifactuAltaPayload) =>
  '<sf:RegistroAlta>' +
  element('sf:IDVersion', verifactuVersion) +
  buildIdFacturaAltaXml(payload) +
  element('sf:NombreRazonEmisor', payload.sellerLegalName) +
  element('sf:TipoFactura', 'F1') +
  element('sf:DescripcionOperacion', 'Operacion facturada') +
  buildDestinatariosXml(payload) +
  buildDesgloseXml(payload) +
  element('sf:CuotaTotal', centsToAmount(payload.taxCents)) +
  element('sf:ImporteTotal', centsToAmount(payload.totalCents)) +
  buildEncadenamientoXml(payload) +
  buildSistemaInformaticoXml(payload) +
  element('sf:FechaHoraHusoGenRegistro', payload.issueDate) +
  element('sf:TipoHuella', '01') +
  element('sf:Huella', payload.internalHash) +
  '</sf:RegistroAlta>';

const buildRegistroAnulacionXml = (payload: VerifactuAnulacionPayload) =>
  '<sf:RegistroAnulacion>' +
  element('sf:IDVersion', verifactuVersion) +
  buildIdFacturaAnulacionXml(payload) +
  buildEncadenamientoXml(payload) +
  buildSistemaInformaticoXml(payload) +
  element('sf:FechaHoraHusoGenRegistro', payload.issueDate) +
  element('sf:TipoHuella', '01') +
  element('sf:Huella', payload.internalHash) +
  '</sf:RegistroAnulacion>';

export const buildVerifactuXml = (payload: VerifactuPayload) => {
  const registroXml = payload.recordType === 'ALTA'
    ? buildRegistroAltaXml(payload)
    : buildRegistroAnulacionXml(payload);

  return '<?xml version="1.0" encoding="UTF-8"?>' +
    `<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="${verifactuSuministroLRNamespace}" xmlns:sf="${verifactuSuministroInformacionNamespace}">` +
    buildObligadoEmisionXml(payload) +
    '<sfLR:RegistroFactura>' +
    registroXml +
    '</sfLR:RegistroFactura>' +
    '</sfLR:RegFactuSistemaFacturacion>';
};

export const logVerifactuXmlPreviewForFiscalRecord = async ({
  client,
  fiscalRecordId,
  organizationCountryCode,
  logger = console,
}: {
  client: VerifactuPreviewClient;
  fiscalRecordId: string;
  organizationCountryCode: string | null | undefined;
  logger?: VerifactuXmlPreviewLogger;
}) => {
  if (organizationCountryCode !== 'ES') {
    return;
  }

  try {
    const record = await client.invoiceFiscalRecord.findUnique({
      where: { id: fiscalRecordId },
      select: verifactuPayloadFiscalRecordSelect,
    });

    if (!record) {
      throw new Error('Unable to load invoice fiscal record for VERI*FACTU XML preview.');
    }

    logger.log(verifactuPreviewLogPrefix, buildVerifactuXml(buildVerifactuPayload(record)));
  } catch (error) {
    logger.error(verifactuPreviewErrorLogPrefix, error);
  }
};
