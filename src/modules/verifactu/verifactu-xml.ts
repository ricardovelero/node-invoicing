import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import {
  buildVerifactuPayload,
  verifactuPayloadFiscalRecordSelect,
  type BuildVerifactuPayloadOptions,
  type VerifactuAltaPayload,
  type VerifactuAnulacionPayload,
  type VerifactuPayload,
  type VerifactuTaxBreakdownItem,
} from './verifactu-payload';
import { formatVerifactuDate } from './verifactu-huella';

export const verifactuSuministroLRNamespace =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
export const verifactuSuministroInformacionNamespace =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

const verifactuPreviewLogPrefix = '[VERIFACTU_XML_PREVIEW]';
const verifactuPreviewErrorLogPrefix = '[VERIFACTU_XML_PREVIEW_ERROR]';

type VerifactuXmlPreviewLogger = Pick<typeof console, 'log' | 'error'>;

type VerifactuPreviewClient = Pick<Prisma.TransactionClient, 'invoiceFiscalRecord'>;

export type VerifactuXsdValidationResult =
  | { ok: true }
  | { ok: false; error: string };

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
  element('sf:FechaExpedicionFactura', formatVerifactuDate(payload.issueDate)) +
  '</sf:IDFactura>';

const buildIdFacturaAnulacionXml = (payload: VerifactuAnulacionPayload) =>
  '<sf:IDFactura>' +
  element('sf:IDEmisorFacturaAnulada', payload.sellerTaxId) +
  element('sf:NumSerieFacturaAnulada', payload.invoiceNumber) +
  element('sf:FechaExpedicionFacturaAnulada', formatVerifactuDate(payload.issueDate)) +
  '</sf:IDFactura>';

const buildDestinatariosXml = (payload: VerifactuAltaPayload) => {
  if (!payload.customer.nif) {
    return '';
  }

  return '<sf:Destinatarios>' +
    '<sf:IDDestinatario>' +
    element('sf:NombreRazon', payload.customer.name) +
    element('sf:NIF', payload.customer.nif) +
    '</sf:IDDestinatario>' +
    '</sf:Destinatarios>';
};

const buildTaxBreakdownItemXml = (item: VerifactuTaxBreakdownItem) =>
  '<sf:DetalleDesglose>' +
  element('sf:Impuesto', item.taxType) +
  optionalElement('sf:ClaveRegimen', item.taxRegimeKey) +
  optionalElement('sf:CalificacionOperacion', item.operationClassification) +
  optionalElement('sf:OperacionExenta', item.exemptOperation) +
  optionalElement('sf:TipoImpositivo', item.taxRate) +
  element('sf:BaseImponibleOimporteNoSujeto', item.taxableBaseAmount) +
  optionalElement('sf:CuotaRepercutida', item.taxAmount) +
  optionalElement('sf:TipoRecargoEquivalencia', item.equivalenceSurchargeRate) +
  optionalElement('sf:CuotaRecargoEquivalencia', item.equivalenceSurchargeAmount) +
  '</sf:DetalleDesglose>';

const buildDesgloseXml = (payload: VerifactuAltaPayload) =>
  '<sf:Desglose>' +
  payload.taxBreakdown.map(buildTaxBreakdownItemXml).join('') +
  '</sf:Desglose>';

const buildEncadenamientoXml = (payload: VerifactuPayload) => {
  if (!payload.previousRecord) {
    return '<sf:Encadenamiento>' +
      element('sf:PrimerRegistro', 'S') +
      '</sf:Encadenamiento>';
  }

  return '<sf:Encadenamiento>' +
    '<sf:RegistroAnterior>' +
    element('sf:IDEmisorFactura', payload.previousRecord.sellerTaxId) +
    element('sf:NumSerieFactura', payload.previousRecord.invoiceNumber) +
    element(
      'sf:FechaExpedicionFactura',
      formatVerifactuDate(payload.previousRecord.issueDate),
    ) +
    element('sf:Huella', payload.previousRecord.huella) +
    '</sf:RegistroAnterior>' +
    '</sf:Encadenamiento>';
};

const buildSistemaInformaticoXml = (payload: VerifactuPayload) =>
  '<sf:SistemaInformatico>' +
  element('sf:NombreRazon', payload.software.producerName) +
  element('sf:NIF', payload.software.producerTaxId) +
  element('sf:NombreSistemaInformatico', payload.software.name) +
  element('sf:IdSistemaInformatico', payload.software.id) +
  element('sf:Version', payload.software.version) +
  element('sf:NumeroInstalacion', payload.software.installationNumber) +
  element('sf:TipoUsoPosibleSoloVerifactu', payload.software.onlyVerifactu) +
  element('sf:TipoUsoPosibleMultiOT', payload.software.multiTaxpayerUse) +
  element('sf:IndicadorMultiplesOT', payload.software.multipleTaxpayers) +
  '</sf:SistemaInformatico>';

const buildRegistroAltaXml = (payload: VerifactuAltaPayload) =>
  '<sf:RegistroAlta>' +
  element('sf:IDVersion', payload.payloadVersion) +
  buildIdFacturaAltaXml(payload) +
  element('sf:NombreRazonEmisor', payload.sellerLegalName) +
  element('sf:TipoFactura', payload.invoiceType) +
  element('sf:DescripcionOperacion', payload.operationDescription) +
  buildDestinatariosXml(payload) +
  buildDesgloseXml(payload) +
  element('sf:CuotaTotal', payload.taxAmount) +
  element('sf:ImporteTotal', payload.totalAmount) +
  buildEncadenamientoXml(payload) +
  buildSistemaInformaticoXml(payload) +
  element('sf:FechaHoraHusoGenRegistro', payload.generationDateTimeWithTimezone) +
  element('sf:TipoHuella', payload.huellaType) +
  element('sf:Huella', payload.huella) +
  '</sf:RegistroAlta>';

const buildRegistroAnulacionXml = (payload: VerifactuAnulacionPayload) =>
  '<sf:RegistroAnulacion>' +
  element('sf:IDVersion', payload.payloadVersion) +
  buildIdFacturaAnulacionXml(payload) +
  buildEncadenamientoXml(payload) +
  buildSistemaInformaticoXml(payload) +
  element('sf:FechaHoraHusoGenRegistro', payload.generationDateTimeWithTimezone) +
  element('sf:TipoHuella', payload.huellaType) +
  element('sf:Huella', payload.huella) +
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

export const validateVerifactuXmlWithXsd = async (
  xml: string,
): Promise<VerifactuXsdValidationResult> => {
  const xsdDirectory = path.join(
    process.cwd(),
    'vendor',
    'aeat',
    'verifactu',
    'xsd',
  );

  return new Promise((resolve) => {
    const child = spawn('xmllint', ['--noout', '--schema', 'SuministroLR.xsd', '-'], {
      cwd: xsdDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];

    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (error) => resolve({ ok: false, error: error.message }));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }

      resolve({ ok: false, error: Buffer.concat(chunks).toString('utf8') });
    });
    child.stdin.end(xml);
  });
};

export const logVerifactuXmlPreviewForFiscalRecord = async ({
  client,
  fiscalRecordId,
  organizationCountryCode,
  payloadOptions,
  logger = console,
}: {
  client: VerifactuPreviewClient;
  fiscalRecordId: string;
  organizationCountryCode: string | null | undefined;
  payloadOptions: BuildVerifactuPayloadOptions;
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

    logger.log(
      verifactuPreviewLogPrefix,
      buildVerifactuXml(buildVerifactuPayload(record, payloadOptions)),
    );
  } catch (error) {
    logger.error(verifactuPreviewErrorLogPrefix, error);
  }
};
