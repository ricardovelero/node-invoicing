import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';
import { URL } from 'node:url';

const soapEnvelopeNamespace = 'http://schemas.xmlsoap.org/soap/envelope/';
const defaultTestEndpoint =
  'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';
const productionHosts = new Set([
  'www1.agenciatributaria.gob.es',
  'www10.agenciatributaria.gob.es',
]);

type VerifactuSoapEnvironment = 'test';

export type VerifactuSoapConfig = {
  env: VerifactuSoapEnvironment;
  endpoint: string;
  certPath: string;
  certPassphrase?: string;
};

export type VerifactuSoapTransportRequest = {
  endpoint: string;
  body: string;
  certPath: string;
  certPassphrase?: string;
};

export type VerifactuSoapTransportResponse = {
  status: number;
  body: string;
};

export type VerifactuSoapTransport = (
  request: VerifactuSoapTransportRequest,
) => Promise<VerifactuSoapTransportResponse>;

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

export const getVerifactuTestEndpointFromWsdl = (wsdl: string) => {
  const testPort = wsdl.match(
    /<wsdl:port\s+name="SistemaVerifactuPruebas"[\s\S]*?<soap:address\s+location="([^"]+)"/,
  );

  if (!testPort?.[1]) {
    throw new Error('Could not find AEAT Veri*Factu preproduction endpoint in WSDL.');
  }

  return testPort[1];
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

export const loadVerifactuSoapConfig = (
  envSource: NodeJS.ProcessEnv = process.env,
  wsdl = readVerifactuWsdl(),
): VerifactuSoapConfig => {
  const env = envSource.VERIFACTU_AEAT_ENV;

  if (env !== 'test') {
    throw new Error('VERIFACTU_AEAT_ENV must be set to test for this preproduction spike.');
  }

  const certPath = envSource.VERIFACTU_CERT_PATH?.trim();

  if (!certPath) {
    throw new Error('VERIFACTU_CERT_PATH is required for AEAT client certificate TLS.');
  }

  const endpoint = envSource.VERIFACTU_TEST_ENDPOINT?.trim() ||
    getVerifactuTestEndpointFromWsdl(wsdl) ||
    defaultTestEndpoint;
  const parsedEndpoint = new URL(endpoint);

  if (parsedEndpoint.protocol !== 'https:') {
    throw new Error('VERIFACTU_TEST_ENDPOINT must use https.');
  }

  if (productionHosts.has(parsedEndpoint.hostname)) {
    throw new Error('Production AEAT Veri*Factu endpoints are disabled in this test spike.');
  }

  return {
    env,
    endpoint,
    certPath,
    certPassphrase: envSource.VERIFACTU_CERT_PASSPHRASE,
  };
};

const createClientCertificateOptions = (
  certPath: string,
  passphrase: string | undefined,
) => {
  const certificate = readFileSync(certPath);
  const extension = path.extname(certPath).toLowerCase();
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
  certPath,
  certPassphrase,
}) => new Promise((resolve, reject) => {
  const endpointUrl = new URL(endpoint);
  const req = httpsRequest(
    endpointUrl,
    {
      method: 'POST',
      ...createClientCertificateOptions(certPath, certPassphrase),
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
    certPassphrase: config.certPassphrase,
  });

  return {
    endpoint: config.endpoint,
    requestXml,
    responseXml: response.body,
    httpStatus: response.status,
  };
};
