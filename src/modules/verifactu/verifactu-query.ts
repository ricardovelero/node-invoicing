import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Prisma, VerifactuRecordStatus } from '@prisma/client';
import {
  getVerifactuTestEndpointFromWsdl,
  loadVerifactuSoapConfig,
  readVerifactuWsdl,
  sendVerifactuSoapRequest,
  type VerifactuSoapConfig,
  type VerifactuSoapTransport,
} from './verifactu-soap';
import { formatVerifactuDate } from './verifactu-huella';

const soapEnvelopeNamespace = 'http://schemas.xmlsoap.org/soap/envelope/';
const consultaLRNamespace =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/' +
  'tike/cont/ws/ConsultaLR.xsd';
const suministroInformacionNamespace =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/' +
  'tike/cont/ws/SuministroInformacion.xsd';
const importLibxml2Wasm = Function('return import("libxml2-wasm")') as () =>
  Promise<typeof import('libxml2-wasm')>;

export type VerifactuQueryIdentity = {
  sellerTaxId: string;
  sellerLegalName: string;
  invoiceNumber: string;
  issueDate: Date;
};

export type ParsedVerifactuQueryResponse = {
  kind: 'response';
  resultadoConsulta: string | null;
  indicadorPaginacion: string | null;
  records: Array<{
    idFactura: {
      idEmisorFactura: string | null;
      numSerieFactura: string | null;
      fechaExpedicionFactura: string | null;
    };
    estadoRegistro: string | null;
    codigoErrorRegistro: string | null;
    descripcionErrorRegistro: string | null;
  }>;
} | {
  kind: 'fault';
  faultCode: string | null;
  faultString: string | null;
  detail: string | null;
};

export type VerifactuQueryXsdValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export type VerifactuQueryPersistenceClient = {
  verifactuRecord: {
    findUnique: (args: {
      where: { id: string };
      select: { status: true };
    }) => Promise<{ status: VerifactuRecordStatus } | null>;
    update: (args: {
      where: { id: string };
      data: Prisma.VerifactuRecordUpdateInput;
      select: {
        id: true;
        status: true;
        aeatLastQueryEstadoRegistro: true;
        aeatLastQueryCodigoErrorRegistro: true;
        aeatLastQueryDescripcionErrorRegistro: true;
      };
    }) => Promise<{
      id: string;
      status: VerifactuRecordStatus;
      aeatLastQueryEstadoRegistro: string | null;
      aeatLastQueryCodigoErrorRegistro: string | null;
      aeatLastQueryDescripcionErrorRegistro: string | null;
    }>;
  };
};

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const decodeXmlText = (value: string) => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

const tagPattern = (tagName: string) => `(?:[A-Za-z_][\\w.-]*:)?${tagName}`;

const elementsXml = (xml: string, tagName: string) => {
  const tag = tagPattern(tagName);
  const matches = xml.matchAll(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gu'),
  );

  return Array.from(matches, (match) => match[1] ?? '');
};

const elementXml = (xml: string, tagName: string) => elementsXml(xml, tagName)[0] ?? null;

const elementOuterXml = (xml: string, tagName: string) => {
  const tag = tagPattern(tagName);
  const match = xml.match(
    new RegExp(`(<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>)`, 'u'),
  );

  return match?.[1] ?? null;
};

const elementText = (xml: string, tagName: string) => {
  const value = elementXml(xml, tagName);

  if (value === null) {
    return null;
  }

  return decodeXmlText(value.replace(/<[^>]+>/gu, '').trim()) || null;
};

const directElementText = (xml: string, tagName: string) => {
  const tag = tagPattern(tagName);
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)<\\/${tag}>`, 'u'));

  return match?.[1] ? decodeXmlText(match[1].trim()) || null : null;
};

const issuePeriod = (issueDate: Date) => ({
  year: String(issueDate.getUTCFullYear()),
  month: String(issueDate.getUTCMonth() + 1).padStart(2, '0'),
});

export const getVerifactuQueryTestEndpointFromWsdl = getVerifactuTestEndpointFromWsdl;

export const loadVerifactuQuerySoapConfig = loadVerifactuSoapConfig;

export const buildVerifactuQuerySoapEnvelope = ({
  sellerTaxId,
  sellerLegalName,
  invoiceNumber,
  issueDate,
}: VerifactuQueryIdentity) => {
  const period = issuePeriod(issueDate);
  const formattedIssueDate = formatVerifactuDate(issueDate.toISOString());

  return '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="${soapEnvelopeNamespace}">` +
    '<soapenv:Header/>' +
    '<soapenv:Body>' +
    `<sfLRC:ConsultaFactuSistemaFacturacion xmlns:sfLRC="${consultaLRNamespace}" ` +
    `xmlns:sf="${suministroInformacionNamespace}">` +
    '<sfLRC:Cabecera>' +
    '<sf:IDVersion>1.0</sf:IDVersion>' +
    '<sf:ObligadoEmision>' +
    `<sf:NombreRazon>${escapeXml(sellerLegalName)}</sf:NombreRazon>` +
    `<sf:NIF>${escapeXml(sellerTaxId)}</sf:NIF>` +
    '</sf:ObligadoEmision>' +
    '</sfLRC:Cabecera>' +
    '<sfLRC:FiltroConsulta>' +
    '<sfLRC:PeriodoImputacion>' +
    `<sf:Ejercicio>${period.year}</sf:Ejercicio>` +
    `<sf:Periodo>${period.month}</sf:Periodo>` +
    '</sfLRC:PeriodoImputacion>' +
    `<sfLRC:NumSerieFactura>${escapeXml(invoiceNumber)}</sfLRC:NumSerieFactura>` +
    '<sfLRC:FechaExpedicionFactura>' +
    `<sf:FechaExpedicionFactura>${formattedIssueDate}</sf:FechaExpedicionFactura>` +
    '</sfLRC:FechaExpedicionFactura>' +
    '</sfLRC:FiltroConsulta>' +
    '</sfLRC:ConsultaFactuSistemaFacturacion>' +
    '</soapenv:Body>' +
    '</soapenv:Envelope>';
};

const parseQueryRecord = (xml: string) => {
  const idFacturaXml = elementXml(xml, 'IDFactura') ?? '';

  return {
    idFactura: {
      idEmisorFactura: elementText(idFacturaXml, 'IDEmisorFactura'),
      numSerieFactura: elementText(idFacturaXml, 'NumSerieFactura'),
      fechaExpedicionFactura: elementText(idFacturaXml, 'FechaExpedicionFactura'),
    },
    estadoRegistro: directElementText(xml, 'EstadoRegistro'),
    codigoErrorRegistro: directElementText(xml, 'CodigoErrorRegistro'),
    descripcionErrorRegistro: directElementText(xml, 'DescripcionErrorRegistro'),
  };
};

export const parseVerifactuQuerySoapResponse = (responseXml: string): ParsedVerifactuQueryResponse => {
  const faultXml = elementXml(responseXml, 'Fault');

  if (faultXml) {
    return {
      kind: 'fault',
      faultCode: elementText(faultXml, 'faultcode') ?? elementText(faultXml, 'Code'),
      faultString: elementText(faultXml, 'faultstring') ?? elementText(faultXml, 'Text'),
      detail: elementText(faultXml, 'detail') ?? elementText(faultXml, 'Detail'),
    };
  }

  const responseBody = elementXml(responseXml, 'RespuestaConsultaFactuSistemaFacturacion') ??
    responseXml;

  return {
    kind: 'response',
    resultadoConsulta: elementText(responseBody, 'ResultadoConsulta'),
    indicadorPaginacion: elementText(responseBody, 'IndicadorPaginacion'),
    records: elementsXml(responseBody, 'RegistroRespuestaConsultaFactuSistemaFacturacion')
      .map(parseQueryRecord),
  };
};

export const queryVerifactuSoapRecord = async ({
  identity,
  config,
  transport = sendVerifactuSoapRequest,
}: {
  identity: VerifactuQueryIdentity;
  config: VerifactuSoapConfig;
  transport?: VerifactuSoapTransport;
}) => {
  const requestXml = buildVerifactuQuerySoapEnvelope(identity);
  const response = await transport({
    endpoint: config.endpoint,
    body: requestXml,
    certPath: config.certPath,
    certPassphrase: config.certPassphrase,
  });

  return {
    endpoint: config.endpoint,
    requestXml,
    responseXml: response.body,
    httpStatus: response.status,
    parsedResponse: parseVerifactuQuerySoapResponse(response.body),
  };
};

const queryStatusFromResponse = (
  parsed: ParsedVerifactuQueryResponse,
  currentStatus: VerifactuRecordStatus,
) => {
  if (
    parsed.kind === 'response' &&
    parsed.resultadoConsulta === 'ConDatos' &&
    parsed.records[0]?.estadoRegistro === 'Correcto'
  ) {
    return 'ACCEPTED' as const;
  }

  return currentStatus;
};

export const persistVerifactuQueryResponse = async ({
  client,
  verifactuRecordId,
  responseXml,
  queriedAt = new Date(),
}: {
  client: VerifactuQueryPersistenceClient;
  verifactuRecordId: string;
  responseXml: string;
  queriedAt?: Date;
}) => {
  const parsed = parseVerifactuQuerySoapResponse(responseXml);
  const currentRecord = await client.verifactuRecord.findUnique({
    where: { id: verifactuRecordId },
    select: { status: true },
  });

  if (!currentRecord) {
    throw new Error(`VerifactuRecord not found: ${verifactuRecordId}`);
  }

  const firstRecord = parsed.kind === 'response' ? parsed.records[0] : undefined;
  const record = await client.verifactuRecord.update({
    where: { id: verifactuRecordId },
    data: {
      status: queryStatusFromResponse(parsed, currentRecord.status),
      aeatLastQueryResponseXml: responseXml,
      aeatLastQueryResult: parsed as Prisma.InputJsonValue,
      aeatLastQueryAt: queriedAt,
      aeatLastQueryEstadoRegistro: firstRecord?.estadoRegistro ?? null,
      aeatLastQueryCodigoErrorRegistro: parsed.kind === 'fault'
        ? parsed.faultCode
        : firstRecord?.codigoErrorRegistro ?? null,
      aeatLastQueryDescripcionErrorRegistro: parsed.kind === 'fault'
        ? parsed.faultString
        : firstRecord?.descripcionErrorRegistro ?? null,
    },
    select: {
      id: true,
      status: true,
      aeatLastQueryEstadoRegistro: true,
      aeatLastQueryCodigoErrorRegistro: true,
      aeatLastQueryDescripcionErrorRegistro: true,
    },
  });

  return { parsed, record };
};

const queryBodyXml = (xml: string) =>
  elementOuterXml(xml, 'ConsultaFactuSistemaFacturacion') ?? xml;

export const validateVerifactuQueryXmlWithXsd = async (
  xml: string,
): Promise<VerifactuQueryXsdValidationResult> => {
  const xsdDirectory = path.join(
    process.cwd(),
    'vendor',
    'aeat',
    'verifactu',
    'xsd',
  );
  const schemaPath = path.join(xsdDirectory, 'ConsultaLR.xsd');
  const {
    XmlBufferInputProvider,
    XmlDocument,
    XsdValidator,
    xmlCleanupInputProvider,
    xmlRegisterInputProvider,
  } = await importLibxml2Wasm();
  const schemaBuffers = Object.fromEntries(
    readdirSync(xsdDirectory)
      .filter((fileName) => fileName.endsWith('.xsd'))
      .map((fileName) => {
        const filePath = path.join(xsdDirectory, fileName);

        return [filePath, readFileSync(filePath)];
      }),
  );

  schemaBuffers['http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd'] =
    readFileSync(path.join(xsdDirectory, 'xmldsig-core-schema.xsd'));

  xmlRegisterInputProvider(new XmlBufferInputProvider(schemaBuffers));

  let schemaDocument: InstanceType<typeof XmlDocument> | undefined;
  let xmlDocument: InstanceType<typeof XmlDocument> | undefined;
  let validator: InstanceType<typeof XsdValidator> | undefined;

  try {
    schemaDocument = XmlDocument.fromString(readFileSync(schemaPath, 'utf8'), {
      url: schemaPath,
    });
    validator = XsdValidator.fromDoc(schemaDocument);
    xmlDocument = XmlDocument.fromString(queryBodyXml(xml));
    validator.validate(xmlDocument);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    validator?.dispose();
    xmlDocument?.dispose();
    schemaDocument?.dispose();
    xmlCleanupInputProvider();
  }
};

export const readVerifactuQueryWsdl = readVerifactuWsdl;
