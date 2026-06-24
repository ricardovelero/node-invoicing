import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVerifactuSoapEnvelope,
  getVerifactuTestEndpointFromWsdl,
  loadVerifactuSoapConfig,
  readVerifactuWsdl,
  submitVerifactuSoapXml,
} from './verifactu-soap';

const regFactuXml = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="urn:test">' +
  '<sfLR:Cabecera/>' +
  '</sfLR:RegFactuSistemaFacturacion>';

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
});
