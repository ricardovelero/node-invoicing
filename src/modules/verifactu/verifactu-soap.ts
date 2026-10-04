import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';
import { URL } from 'node:url';
import type { VerifactuRecordStatus } from '@prisma/client';

const soapEnvelopeNamespace = 'http://schemas.xmlsoap.org/soap/envelope/';
const defaultTestEndpoint =
  'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';
const productionHosts = new Set([
  'www1.agenciatributaria.gob.es',
  'www10.agenciatributaria.gob.es',
]);

type VerifactuSoapEnvironment = 'test' | 'production';

// The client certificate is either a file (certPath) or PKCS#12 contents held
// in memory (certificate), as loaded from an organization's stored certificate.
export type VerifactuSoapConfig = {
  env: VerifactuSoapEnvironment;
  endpoint: string;
  certPath?: string;
  certificate?: Buffer;
  certPassphrase?: string;
};

// Endpoints for the configured AEAT environment. Seal certificates (certificado
// de sello) use their own endpoint.
export type VerifactuSoapEnvironmentConfig = {
  env: VerifactuSoapEnvironment;
  endpoint: string;
  sealEndpoint: string;
};

export type VerifactuSoapTransportRequest = {
  endpoint: string;
  body: string;
  certPath?: string;
  certificate?: Buffer;
  certPassphrase?: string;
};

export type VerifactuSoapTransportResponse = {
  status: number;
  body: string;
};

export type VerifactuSoapTransport = (
  request: VerifactuSoapTransportRequest,
) => Promise<VerifactuSoapTransportResponse>;

export type VerifactuSoapPresentationData = {
  nifPresentador: string | null;
  timestampPresentacion: string | null;
  idPeticion: string | null;
};

export type VerifactuSoapLineResponse = {
  idFactura: {
    idEmisorFactura: string | null;
    numSerieFactura: string | null;
    fechaExpedicionFactura: string | null;
  };
  operacion: string | null;
  refExterna: string | null;
  estadoRegistro: string | null;
  codigoErrorRegistro: string | null;
  descripcionErrorRegistro: string | null;
  registroDuplicado: {
    idPeticionRegistroDuplicado: string | null;
    estadoRegistroDuplicado: string | null;
  } | null;
};

export type VerifactuSoapSubmissionResult = {
  kind: 'response';
  csv: string | null;
  datosPresentacion: VerifactuSoapPresentationData | null;
  tiempoEsperaEnvio: string | null;
  estadoEnvio: string | null;
  respuestaLinea: VerifactuSoapLineResponse[];
};

export type VerifactuSoapFaultResult = {
  kind: 'fault';
  faultCode: string | null;
  faultString: string | null;
  detail: string | null;
};

export type ParsedVerifactuSoapSubmission =
  | VerifactuSoapSubmissionResult
  | VerifactuSoapFaultResult;

export const readVerifactuWsdl = () => readFileSync(
  path.join(
    process.cwd(),
    'vendor',
    'aeat',
    'verifactu',
    'wsdl',
    'SistemaFacturacion.wsdl',
  ),
  'utf8',
);

export const getVerifactuEndpointFromWsdl = (
  wsdl: string,
  portName = 'SistemaVerifactuPruebas',
) => {
  const port = wsdl.match(new RegExp(
    `<wsdl:port\\s+name="${portName}"[\\s\\S]*?<soap:address\\s+location="([^"]+)"`,
  ));

  if (!port?.[1]) {
    throw new Error(`Could not find AEAT Veri*Factu ${portName} endpoint in WSDL.`);
  }

  return port[1];
};

export const buildVerifactuSoapEnvelope = (regFactuXml: string) => {
  const body = regFactuXml.trim().replace(/^<\?xml[^>]*>\s*/u, '');

  return '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="${soapEnvelopeNamespace}">` +
    '<soapenv:Header/>' +
    '<soapenv:Body>' +
    body +
    '</soapenv:Body>' +
    '</soapenv:Envelope>';
};

const validateTestEndpoint = (endpoint: string, name = 'VERIFACTU_TEST_ENDPOINT') => {
  const parsedEndpoint = new URL(endpoint);

  if (parsedEndpoint.protocol !== 'https:') {
    throw new Error(`${name} must use https.`);
  }

  if (productionHosts.has(parsedEndpoint.hostname)) {
    throw new Error(`${name} can't point to AEAT production; use VERIFACTU_AEAT_ENV=production.`);
  }

  return endpoint;
};

export const loadVerifactuSoapEnvironment = (
  envSource: NodeJS.ProcessEnv = process.env,
  wsdl = readVerifactuWsdl(),
): VerifactuSoapEnvironmentConfig => {
  const env = envSource.VERIFACTU_AEAT_ENV;

  // Production always uses AEAT's endpoints from the WSDL; overrides are test-only.
  if (env === 'production') {
    return {
      env,
      endpoint: getVerifactuEndpointFromWsdl(wsdl, 'SistemaVerifactu'),
      sealEndpoint: getVerifactuEndpointFromWsdl(wsdl, 'SistemaVerifactuSello'),
    };
  }

  if (env !== 'test') {
    throw new Error('VERIFACTU_AEAT_ENV must be set to test or production.');
  }

  return {
    env,
    endpoint: validateTestEndpoint(
      envSource.VERIFACTU_TEST_ENDPOINT?.trim() ||
        getVerifactuEndpointFromWsdl(wsdl) ||
        defaultTestEndpoint,
    ),
    sealEndpoint: validateTestEndpoint(
      envSource.VERIFACTU_TEST_SEAL_ENDPOINT?.trim() ||
        getVerifactuEndpointFromWsdl(wsdl, 'SistemaVerifactuSelloPruebas'),
      'VERIFACTU_TEST_SEAL_ENDPOINT',
    ),
  };
};

// Uses the single certificate file from VERIFACTU_CERT_PATH, as the manual test
// scripts do. The worker and reconciliation job use each organization's own.
// The scripts bypass the worker's ordering, so they only run in preproduction.
export const loadVerifactuSoapConfig = (
  envSource: NodeJS.ProcessEnv = process.env,
  wsdl = readVerifactuWsdl(),
): VerifactuSoapConfig => {
  if (envSource.VERIFACTU_AEAT_ENV !== 'test') {
    throw new Error('The Veri*Factu test scripts require VERIFACTU_AEAT_ENV=test.');
  }

  const certPath = envSource.VERIFACTU_CERT_PATH?.trim();

  if (!certPath) {
    throw new Error('VERIFACTU_CERT_PATH is required for AEAT client certificate TLS.');
  }

  const { env, endpoint } = loadVerifactuSoapEnvironment(envSource, wsdl);

  return {
    env,
    endpoint,
    certPath,
    certPassphrase: envSource.VERIFACTU_CERT_PASSPHRASE,
  };
};

const createClientCertificateOptions = ({
  certPath,
  certificate: certificateContents,
  certPassphrase: passphrase,
}: Pick<VerifactuSoapTransportRequest, 'certPath' | 'certificate' | 'certPassphrase'>) => {
  if (!certificateContents && !certPath) {
    throw new Error('AEAT client certificate TLS requires a certificate.');
  }

  const certificate = certificateContents ?? readFileSync(certPath!);
  const extension = certPath ? path.extname(certPath).toLowerCase() : '';
  const common = passphrase ? { passphrase } : {};

  if (extension === '.pem') {
    return {
      cert: certificate,
      key: certificate,
      ...common,
    };
  }

  return {
    pfx: certificate,
    ...common,
  };
};

export const sendVerifactuSoapRequest: VerifactuSoapTransport = ({
  endpoint,
  body,
  ...clientCertificate
}) => new Promise((resolve, reject) => {
  const endpointUrl = new URL(endpoint);
  const req = httpsRequest(
    endpointUrl,
    {
      method: 'POST',
      ...createClientCertificateOptions(clientCertificate),
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '""',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    },
  );

  req.on('error', reject);
  req.end(body);
});

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

const elementText = (xml: string, tagName: string) => {
  const value = elementXml(xml, tagName);

  if (value === null) {
    return null;
  }

  return decodeXmlText(value.replace(/<[^>]+>/gu, '').trim()) || null;
};

const parseDatosPresentacion = (xml: string): VerifactuSoapPresentationData | null => {
  const datosPresentacionXml = elementXml(xml, 'DatosPresentacion');

  if (!datosPresentacionXml) {
    return null;
  }

  return {
    nifPresentador: elementText(datosPresentacionXml, 'NIFPresentador'),
    timestampPresentacion: elementText(datosPresentacionXml, 'TimestampPresentacion'),
    idPeticion: elementText(datosPresentacionXml, 'IdPeticion'),
  };
};

const parseRespuestaLinea = (xml: string): VerifactuSoapLineResponse => {
  const idFacturaXml = elementXml(xml, 'IDFactura') ?? '';
  const registroDuplicadoXml = elementXml(xml, 'RegistroDuplicado');

  return {
    idFactura: {
      idEmisorFactura: elementText(idFacturaXml, 'IDEmisorFactura'),
      numSerieFactura: elementText(idFacturaXml, 'NumSerieFactura'),
      fechaExpedicionFactura: elementText(idFacturaXml, 'FechaExpedicionFactura'),
    },
    operacion: elementText(xml, 'Operacion'),
    refExterna: elementText(xml, 'RefExterna'),
    estadoRegistro: elementText(xml, 'EstadoRegistro'),
    codigoErrorRegistro: elementText(xml, 'CodigoErrorRegistro'),
    descripcionErrorRegistro: elementText(xml, 'DescripcionErrorRegistro'),
    registroDuplicado: registroDuplicadoXml
      ? {
          idPeticionRegistroDuplicado: elementText(
            registroDuplicadoXml,
            'IdPeticionRegistroDuplicado',
          ),
          estadoRegistroDuplicado: elementText(registroDuplicadoXml, 'EstadoRegistroDuplicado'),
        }
      : null,
  };
};

export const isAcceptedDuplicateVerifactuResponse = (
  line: VerifactuSoapLineResponse | undefined,
) => line?.codigoErrorRegistro === '3000' &&
  line.registroDuplicado?.estadoRegistroDuplicado === 'Correcta';

export const parseVerifactuSoapSubmissionResponse = (
  responseXml: string,
): ParsedVerifactuSoapSubmission => {
  const faultXml = elementXml(responseXml, 'Fault');

  if (faultXml) {
    return {
      kind: 'fault',
      faultCode: elementText(faultXml, 'faultcode') ?? elementText(faultXml, 'Code'),
      faultString: elementText(faultXml, 'faultstring') ?? elementText(faultXml, 'Text'),
      detail: elementText(faultXml, 'detail') ?? elementText(faultXml, 'Detail'),
    };
  }

  const responseBody = elementXml(responseXml, 'RespuestaRegFactuSistemaFacturacion') ?? responseXml;

  return {
    kind: 'response',
    csv: elementText(responseBody, 'CSV'),
    datosPresentacion: parseDatosPresentacion(responseBody),
    tiempoEsperaEnvio: elementText(responseBody, 'TiempoEsperaEnvio'),
    estadoEnvio: elementText(responseBody, 'EstadoEnvio'),
    respuestaLinea: elementsXml(responseBody, 'RespuestaLinea').map(parseRespuestaLinea),
  };
};

// Returns null for SOAP faults: they carry no AEAT verdict on the record, so the
// current status must be kept rather than treating a transport error as rejection.
export const verifactuStatusFromSoapSubmission = (
  parsed: ParsedVerifactuSoapSubmission,
  lineIndex = 0,
): VerifactuRecordStatus | null => {
  if (parsed.kind === 'fault') {
    return null;
  }

  const line = parsed.respuestaLinea[lineIndex];
  const estadoRegistro = line?.estadoRegistro;

  if (isAcceptedDuplicateVerifactuResponse(line)) {
    return 'ACCEPTED';
  }

  if (estadoRegistro === 'Correcto') {
    return 'ACCEPTED';
  }

  if (estadoRegistro === 'AceptadoConErrores') {
    return 'ACCEPTED_WITH_ERRORS';
  }

  if (estadoRegistro === 'Incorrecto' || estadoRegistro === 'Rechazado') {
    return 'REJECTED';
  }

  if (parsed.estadoEnvio === 'Incorrecto') {
    return 'REJECTED';
  }

  return 'SUBMITTED';
};

export const submitVerifactuSoapXml = async ({
  regFactuXml,
  config,
  transport = sendVerifactuSoapRequest,
}: {
  regFactuXml: string;
  config: VerifactuSoapConfig;
  transport?: VerifactuSoapTransport;
}) => {
  const requestXml = buildVerifactuSoapEnvelope(regFactuXml);
  const response = await transport({
    endpoint: config.endpoint,
    body: requestXml,
    certPath: config.certPath,
    certificate: config.certificate,
    certPassphrase: config.certPassphrase,
  });

  return {
    endpoint: config.endpoint,
    requestXml,
    responseXml: response.body,
    httpStatus: response.status,
    parsedResponse: parseVerifactuSoapSubmissionResponse(response.body),
  };
};
