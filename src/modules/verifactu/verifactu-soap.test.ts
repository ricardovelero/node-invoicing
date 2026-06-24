import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVerifactuSoapEnvelope,
  getVerifactuTestEndpointFromWsdl,
  loadVerifactuSoapConfig,
  parseVerifactuSoapSubmissionResponse,
  readVerifactuWsdl,
  submitVerifactuSoapXml,
  verifactuStatusFromSoapSubmission,
} from './verifactu-soap';

const regFactuXml = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="urn:test">' +
  '<sfLR:Cabecera/>' +
  '</sfLR:RegFactuSistemaFacturacion>';

const soapResponse = ({
  estadoEnvio,
  estadoRegistro,
  codigoErrorRegistro,
  descripcionErrorRegistro,
  registroDuplicado,
}: {
  estadoEnvio: string;
  estadoRegistro: string;
  codigoErrorRegistro?: string;
  descripcionErrorRegistro?: string;
  registroDuplicado?: {
    idPeticionRegistroDuplicado: string;
    estadoRegistroDuplicado: string;
  };
}) => '<?xml version="1.0" encoding="UTF-8"?>' +
  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
  'xmlns:sfR="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/' +
  'aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd" ' +
  'xmlns:sf="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/' +
  'aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">' +
  '<soapenv:Body>' +
  '<sfR:RespuestaRegFactuSistemaFacturacion>' +
  '<sfR:CSV>CSV123</sfR:CSV>' +
  '<sfR:DatosPresentacion>' +
  '<sf:NIFPresentador>B12345678</sf:NIFPresentador>' +
  '<sf:TimestampPresentacion>2026-05-27T10:16:30+02:00</sf:TimestampPresentacion>' +
  '</sfR:DatosPresentacion>' +
  '<sfR:Cabecera/>' +
  '<sfR:TiempoEsperaEnvio>60</sfR:TiempoEsperaEnvio>' +
  `<sfR:EstadoEnvio>${estadoEnvio}</sfR:EstadoEnvio>` +
  '<sfR:RespuestaLinea>' +
  '<sfR:IDFactura>' +
  '<sf:IDEmisorFactura>B12345678</sf:IDEmisorFactura>' +
  '<sf:NumSerieFactura>INV-2026-0001</sf:NumSerieFactura>' +
  '<sf:FechaExpedicionFactura>27-05-2026</sf:FechaExpedicionFactura>' +
  '</sfR:IDFactura>' +
  '<sfR:Operacion>Alta</sfR:Operacion>' +
  '<sfR:RefExterna>fiscal_record_1</sfR:RefExterna>' +
  `<sfR:EstadoRegistro>${estadoRegistro}</sfR:EstadoRegistro>` +
  (codigoErrorRegistro
    ? `<sfR:CodigoErrorRegistro>${codigoErrorRegistro}</sfR:CodigoErrorRegistro>`
    : '') +
  (descripcionErrorRegistro
    ? `<sfR:DescripcionErrorRegistro>${descripcionErrorRegistro}</sfR:DescripcionErrorRegistro>`
    : '') +
  (registroDuplicado
    ? '<sfR:RegistroDuplicado>' +
      `<sf:IdPeticionRegistroDuplicado>${registroDuplicado.idPeticionRegistroDuplicado}` +
      '</sf:IdPeticionRegistroDuplicado>' +
      `<sf:EstadoRegistroDuplicado>${registroDuplicado.estadoRegistroDuplicado}` +
      '</sf:EstadoRegistroDuplicado>' +
      '</sfR:RegistroDuplicado>'
    : '') +
  '</sfR:RespuestaLinea>' +
  '</sfR:RespuestaRegFactuSistemaFacturacion>' +
  '</soapenv:Body>' +
  '</soapenv:Envelope>';

const soapFaultResponse = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
  '<soapenv:Body>' +
  '<soapenv:Fault>' +
  '<faultcode>soapenv:Client</faultcode>' +
  '<faultstring>Invalid request</faultstring>' +
  '<detail>Certificate rejected</detail>' +
  '</soapenv:Fault>' +
  '</soapenv:Body>' +
  '</soapenv:Envelope>';

test('buildVerifactuSoapEnvelope wraps RegFactuSistemaFacturacion in SOAP body', () => {
  const envelope = buildVerifactuSoapEnvelope(regFactuXml);

  assert.match(envelope, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(
    envelope,
    /<soapenv:Envelope xmlns:soapenv="http:\/\/schemas\.xmlsoap\.org\/soap\/envelope\/">/,
  );
  assert.match(envelope, /<soapenv:Header\/>/);
  assert.match(envelope, /<soapenv:Body><sfLR:RegFactuSistemaFacturacion/);
  assert.match(envelope, /<\/sfLR:RegFactuSistemaFacturacion><\/soapenv:Body>/);
  assert.equal(envelope.match(/<\?xml/g)?.length, 1);
});

test('getVerifactuTestEndpointFromWsdl reads the AEAT preproduction endpoint', () => {
  assert.equal(
    getVerifactuTestEndpointFromWsdl(readVerifactuWsdl()),
    'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  );
});

test('loadVerifactuSoapConfig accepts only the test environment', () => {
  assert.throws(
    () => loadVerifactuSoapConfig({ VERIFACTU_AEAT_ENV: 'production' }, readVerifactuWsdl()),
    /VERIFACTU_AEAT_ENV must be set to test/,
  );
});

test('loadVerifactuSoapConfig requires a certificate path', () => {
  assert.throws(
    () => loadVerifactuSoapConfig({ VERIFACTU_AEAT_ENV: 'test' }, readVerifactuWsdl()),
    /VERIFACTU_CERT_PATH is required/,
  );
});

test('loadVerifactuSoapConfig allows an explicit test endpoint override', () => {
  assert.deepEqual(
    loadVerifactuSoapConfig(
      {
        VERIFACTU_AEAT_ENV: 'test',
        VERIFACTU_CERT_PATH: '/certs/aeat-test.p12',
        VERIFACTU_CERT_PASSPHRASE: 'secret-passphrase',
        VERIFACTU_TEST_ENDPOINT: 'https://example.test/VerifactuSOAP',
      },
      readVerifactuWsdl(),
    ),
    {
      env: 'test',
      endpoint: 'https://example.test/VerifactuSOAP',
      certPath: '/certs/aeat-test.p12',
      certPassphrase: 'secret-passphrase',
    },
  );
});

test('loadVerifactuSoapConfig rejects non-HTTPS endpoint overrides', () => {
  assert.throws(
    () => loadVerifactuSoapConfig(
      {
        VERIFACTU_AEAT_ENV: 'test',
        VERIFACTU_CERT_PATH: '/certs/aeat-test.p12',
        VERIFACTU_TEST_ENDPOINT: 'http://example.test/VerifactuSOAP',
      },
      readVerifactuWsdl(),
    ),
    /must use https/,
  );
});

test('loadVerifactuSoapConfig rejects known AEAT production endpoints', () => {
  assert.throws(
    () => loadVerifactuSoapConfig(
      {
        VERIFACTU_AEAT_ENV: 'test',
        VERIFACTU_CERT_PATH: '/certs/aeat-test.p12',
        VERIFACTU_TEST_ENDPOINT:
          'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
      },
      readVerifactuWsdl(),
    ),
    /Production AEAT Veri\*Factu endpoints are disabled/,
  );
});

test('submitVerifactuSoapXml sends one SOAP envelope through the provided transport', async () => {
  const result = await submitVerifactuSoapXml({
    regFactuXml,
    config: {
      env: 'test',
      endpoint: 'https://example.test/VerifactuSOAP',
      certPath: '/certs/aeat-test.p12',
      certPassphrase: 'secret-passphrase',
    },
    async transport(request) {
      assert.equal(request.endpoint, 'https://example.test/VerifactuSOAP');
      assert.equal(request.certPath, '/certs/aeat-test.p12');
      assert.equal(request.certPassphrase, 'secret-passphrase');
      assert.match(request.body, /<soapenv:Envelope/);
      assert.match(request.body, /<sfLR:RegFactuSistemaFacturacion/);

      return {
        status: 202,
        body: '<soapenv:Envelope>raw response</soapenv:Envelope>',
      };
    },
  });

  assert.equal(result.endpoint, 'https://example.test/VerifactuSOAP');
  assert.equal(result.httpStatus, 202);
  assert.equal(result.responseXml, '<soapenv:Envelope>raw response</soapenv:Envelope>');
  assert.equal(result.parsedResponse.kind, 'response');
});

test('parseVerifactuSoapSubmissionResponse parses Correcto response fixtures', () => {
  const parsed = parseVerifactuSoapSubmissionResponse(soapResponse({
    estadoEnvio: 'Correcto',
    estadoRegistro: 'Correcto',
  }));

  assert.equal(parsed.kind, 'response');
  assert.equal(verifactuStatusFromSoapSubmission(parsed), 'ACCEPTED');

  if (parsed.kind !== 'response') {
    throw new Error('Expected response result.');
  }

  assert.equal(parsed.csv, 'CSV123');
  assert.deepEqual(parsed.datosPresentacion, {
    nifPresentador: 'B12345678',
    timestampPresentacion: '2026-05-27T10:16:30+02:00',
    idPeticion: null,
  });
  assert.equal(parsed.tiempoEsperaEnvio, '60');
  assert.equal(parsed.estadoEnvio, 'Correcto');
  assert.equal(parsed.respuestaLinea[0]?.estadoRegistro, 'Correcto');
  assert.equal(parsed.respuestaLinea[0]?.idFactura.numSerieFactura, 'INV-2026-0001');
});

test('parseVerifactuSoapSubmissionResponse parses AceptadoConErrores fixtures', () => {
  const parsed = parseVerifactuSoapSubmissionResponse(soapResponse({
    estadoEnvio: 'ParcialmenteCorrecto',
    estadoRegistro: 'AceptadoConErrores',
    codigoErrorRegistro: '4100',
    descripcionErrorRegistro: 'Accepted with warning',
  }));

  assert.equal(parsed.kind, 'response');
  assert.equal(verifactuStatusFromSoapSubmission(parsed), 'ACCEPTED_WITH_ERRORS');

  if (parsed.kind !== 'response') {
    throw new Error('Expected response result.');
  }

  assert.equal(parsed.estadoEnvio, 'ParcialmenteCorrecto');
  assert.equal(parsed.respuestaLinea[0]?.codigoErrorRegistro, '4100');
  assert.equal(parsed.respuestaLinea[0]?.descripcionErrorRegistro, 'Accepted with warning');
});

test('parseVerifactuSoapSubmissionResponse parses Incorrecto response fixtures', () => {
  const parsed = parseVerifactuSoapSubmissionResponse(soapResponse({
    estadoEnvio: 'Incorrecto',
    estadoRegistro: 'Incorrecto',
    codigoErrorRegistro: '5000',
    descripcionErrorRegistro: 'Rejected record',
  }));

  assert.equal(parsed.kind, 'response');
  assert.equal(verifactuStatusFromSoapSubmission(parsed), 'REJECTED');

  if (parsed.kind !== 'response') {
    throw new Error('Expected response result.');
  }

  assert.equal(parsed.estadoEnvio, 'Incorrecto');
  assert.equal(parsed.respuestaLinea[0]?.estadoRegistro, 'Incorrecto');
  assert.equal(parsed.respuestaLinea[0]?.codigoErrorRegistro, '5000');
});

test('parseVerifactuSoapSubmissionResponse maps duplicate correct records to accepted', () => {
  const parsed = parseVerifactuSoapSubmissionResponse(soapResponse({
    estadoEnvio: 'Incorrecto',
    estadoRegistro: 'Incorrecto',
    codigoErrorRegistro: '3000',
    descripcionErrorRegistro: 'Registro de facturación duplicado',
    registroDuplicado: {
      idPeticionRegistroDuplicado: 'ABC123',
      estadoRegistroDuplicado: 'Correcta',
    },
  }));

  assert.equal(parsed.kind, 'response');
  assert.equal(verifactuStatusFromSoapSubmission(parsed), 'ACCEPTED');

  if (parsed.kind !== 'response') {
    throw new Error('Expected response result.');
  }

  assert.equal(parsed.respuestaLinea[0]?.codigoErrorRegistro, '3000');
  assert.deepEqual(parsed.respuestaLinea[0]?.registroDuplicado, {
    idPeticionRegistroDuplicado: 'ABC123',
    estadoRegistroDuplicado: 'Correcta',
  });
});

test('parseVerifactuSoapSubmissionResponse parses SOAP Fault fixtures', () => {
  const parsed = parseVerifactuSoapSubmissionResponse(soapFaultResponse);

  assert.equal(parsed.kind, 'fault');
  assert.equal(verifactuStatusFromSoapSubmission(parsed), 'REJECTED');

  if (parsed.kind !== 'fault') {
    throw new Error('Expected fault result.');
  }

  assert.equal(parsed.faultCode, 'soapenv:Client');
  assert.equal(parsed.faultString, 'Invalid request');
  assert.equal(parsed.detail, 'Certificate rejected');
});
