import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVerifactuQuerySoapEnvelope,
  getVerifactuQueryTestEndpointFromWsdl,
  loadVerifactuQuerySoapConfig,
  parseVerifactuQuerySoapResponse,
  persistVerifactuQueryResponse,
  queryVerifactuSoapRecord,
  readVerifactuQueryWsdl,
  validateVerifactuQueryXmlWithXsd,
} from './verifactu-query';

const identity = {
  sellerTaxId: 'B12345678',
  sellerLegalName: 'Seller Legal SL',
  invoiceNumber: 'INV-2026-0001',
  issueDate: new Date('2026-05-27T00:00:00.000Z'),
};

const queryResponseXml = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
  'xmlns:sfLRRC="urn:respuesta-consulta" xmlns:sf="urn:suministro">' +
  '<soapenv:Body>' +
  '<sfLRRC:RespuestaConsultaFactuSistemaFacturacion>' +
  '<sfLRRC:Cabecera/>' +
  '<sfLRRC:PeriodoImputacion><sf:Ejercicio>2026</sf:Ejercicio>' +
  '<sf:Periodo>05</sf:Periodo></sfLRRC:PeriodoImputacion>' +
  '<sfLRRC:IndicadorPaginacion>N</sfLRRC:IndicadorPaginacion>' +
  '<sfLRRC:ResultadoConsulta>ConDatos</sfLRRC:ResultadoConsulta>' +
  '<sfLRRC:RegistroRespuestaConsultaFactuSistemaFacturacion>' +
  '<sfLRRC:IDFactura>' +
  '<sf:IDEmisorFactura>B12345678</sf:IDEmisorFactura>' +
  '<sf:NumSerieFactura>INV-2026-0001</sf:NumSerieFactura>' +
  '<sf:FechaExpedicionFactura>27-05-2026</sf:FechaExpedicionFactura>' +
  '</sfLRRC:IDFactura>' +
  '<sfLRRC:DatosRegistroFacturacion/>' +
  '<sfLRRC:EstadoRegistro>' +
  '<sfLRRC:TimestampUltimaModificacion>2026-05-27T10:16:30+02:00' +
  '</sfLRRC:TimestampUltimaModificacion>' +
  '<sfLRRC:EstadoRegistro>Correcto</sfLRRC:EstadoRegistro>' +
  '<sfLRRC:CodigoErrorRegistro>4100</sfLRRC:CodigoErrorRegistro>' +
  '<sfLRRC:DescripcionErrorRegistro>Accepted with warning</sfLRRC:DescripcionErrorRegistro>' +
  '</sfLRRC:EstadoRegistro>' +
  '</sfLRRC:RegistroRespuestaConsultaFactuSistemaFacturacion>' +
  '</sfLRRC:RespuestaConsultaFactuSistemaFacturacion>' +
  '</soapenv:Body>' +
  '</soapenv:Envelope>';

const faultXml = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
  '<soapenv:Body><soapenv:Fault>' +
  '<faultcode>soapenv:Client</faultcode>' +
  '<faultstring>Invalid query</faultstring>' +
  '<detail>Query rejected</detail>' +
  '</soapenv:Fault></soapenv:Body></soapenv:Envelope>';

const sinDatosResponseXml = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
  'xmlns:sfLRRC="urn:respuesta-consulta">' +
  '<soapenv:Body>' +
  '<sfLRRC:RespuestaConsultaFactuSistemaFacturacion>' +
  '<sfLRRC:Cabecera/>' +
  '<sfLRRC:PeriodoImputacion/>' +
  '<sfLRRC:IndicadorPaginacion>N</sfLRRC:IndicadorPaginacion>' +
  '<sfLRRC:ResultadoConsulta>SinDatos</sfLRRC:ResultadoConsulta>' +
  '</sfLRRC:RespuestaConsultaFactuSistemaFacturacion>' +
  '</soapenv:Body>' +
  '</soapenv:Envelope>';

test('buildVerifactuQuerySoapEnvelope builds ConsultaFactuSistemaFacturacion request', () => {
  const envelope = buildVerifactuQuerySoapEnvelope(identity);

  assert.match(envelope, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(envelope, /<soapenv:Envelope/);
  assert.match(envelope, /<soapenv:Body><sfLRC:ConsultaFactuSistemaFacturacion\s/);
  assert.match(envelope, /<sf:IDVersion>1\.0<\/sf:IDVersion>/);
  assert.match(envelope, /<sf:NombreRazon>Seller Legal SL<\/sf:NombreRazon>/);
  assert.match(envelope, /<sf:NIF>B12345678<\/sf:NIF>/);
  assert.doesNotMatch(envelope, /<sf:PeriodoImputacion>/);
  assert.match(
    envelope,
    /<sfLRC:FiltroConsulta><sfLRC:PeriodoImputacion><sf:Ejercicio>2026<\/sf:Ejercicio>/,
  );
  assert.match(envelope, /<sf:Ejercicio>2026<\/sf:Ejercicio>/);
  assert.match(envelope, /<sf:Periodo>05<\/sf:Periodo>/);
  assert.match(envelope, /<sfLRC:NumSerieFactura>INV-2026-0001<\/sfLRC:NumSerieFactura>/);
  assert.match(envelope, /<sf:FechaExpedicionFactura>27-05-2026<\/sf:FechaExpedicionFactura>/);
});

test('buildVerifactuQuerySoapEnvelope validates against ConsultaLR XSD', async () => {
  const validation = await validateVerifactuQueryXmlWithXsd(
    buildVerifactuQuerySoapEnvelope(identity),
  );

  assert.deepEqual(validation, { ok: true });
});

test('validateVerifactuQueryXmlWithXsd rejects PeriodoImputacion in sf namespace', async () => {
  const failingXml = buildVerifactuQuerySoapEnvelope(identity)
    .replace('<sfLRC:PeriodoImputacion>', '<sf:PeriodoImputacion>')
    .replace('</sfLRC:PeriodoImputacion>', '</sf:PeriodoImputacion>');
  const validation = await validateVerifactuQueryXmlWithXsd(failingXml);

  assert.equal(validation.ok, false);

  if (validation.ok) {
    throw new Error('Expected invalid query XML.');
  }

  assert.match(validation.error, /PeriodoImputacion|This element is not expected/);
});

test('getVerifactuQueryTestEndpointFromWsdl reads the AEAT preproduction endpoint', () => {
  assert.equal(
    getVerifactuQueryTestEndpointFromWsdl(readVerifactuQueryWsdl()),
    'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  );
});

test('loadVerifactuQuerySoapConfig validates preproduction configuration', () => {
  assert.deepEqual(
    loadVerifactuQuerySoapConfig(
      {
        VERIFACTU_AEAT_ENV: 'test',
        VERIFACTU_CERT_PATH: '/certs/aeat-test.p12',
        VERIFACTU_TEST_ENDPOINT: 'https://example.test/VerifactuSOAP',
      },
      readVerifactuQueryWsdl(),
    ),
    {
      env: 'test',
      endpoint: 'https://example.test/VerifactuSOAP',
      certPath: '/certs/aeat-test.p12',
      certPassphrase: undefined,
    },
  );
});

test('parseVerifactuQuerySoapResponse extracts query record status and identity', () => {
  const parsed = parseVerifactuQuerySoapResponse(queryResponseXml);

  assert.equal(parsed.kind, 'response');

  if (parsed.kind !== 'response') {
    throw new Error('Expected query response result.');
  }

  assert.equal(parsed.resultadoConsulta, 'ConDatos');
  assert.equal(parsed.indicadorPaginacion, 'N');
  assert.deepEqual(parsed.records[0], {
    idFactura: {
      idEmisorFactura: 'B12345678',
      numSerieFactura: 'INV-2026-0001',
      fechaExpedicionFactura: '27-05-2026',
    },
    estadoRegistro: 'Correcto',
    codigoErrorRegistro: '4100',
    descripcionErrorRegistro: 'Accepted with warning',
  });
});

test('parseVerifactuQuerySoapResponse parses SOAP faults', () => {
  const parsed = parseVerifactuQuerySoapResponse(faultXml);

  assert.deepEqual(parsed, {
    kind: 'fault',
    faultCode: 'soapenv:Client',
    faultString: 'Invalid query',
    detail: 'Query rejected',
  });
});

test('queryVerifactuSoapRecord sends query envelope through provided transport', async () => {
  const result = await queryVerifactuSoapRecord({
    identity,
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
      assert.match(request.body, /<sfLRC:ConsultaFactuSistemaFacturacion\s/);
      assert.doesNotMatch(request.body, /secret-passphrase/);

      return {
        status: 200,
        body: queryResponseXml,
      };
    },
  });

  assert.equal(result.endpoint, 'https://example.test/VerifactuSOAP');
  assert.equal(result.httpStatus, 200);
  assert.equal(result.parsedResponse.kind, 'response');
});

test('persistVerifactuQueryResponse accepts ConDatos Correcto responses', async () => {
  let updateArgs: unknown;
  const queriedAt = new Date('2026-05-27T11:00:00.000Z');
  const client = {
    verifactuRecord: {
      async findUnique() {
        return { status: 'GENERATED' as const };
      },
      async update(args: unknown) {
        updateArgs = args;

        return {
          id: 'verifactu_record_1',
          status: 'ACCEPTED' as const,
          aeatLastQueryEstadoRegistro: 'Correcto',
          aeatLastQueryCodigoErrorRegistro: '4100',
          aeatLastQueryDescripcionErrorRegistro: 'Accepted with warning',
        };
      },
    },
  };

  const result = await persistVerifactuQueryResponse({
    client,
    verifactuRecordId: 'verifactu_record_1',
    responseXml: queryResponseXml,
    queriedAt,
  });
  const data = (updateArgs as { data: Record<string, unknown> }).data;

  assert.equal(result.record.status, 'ACCEPTED');
  assert.equal(data.status, 'ACCEPTED');
  assert.equal(data.aeatLastQueryResponseXml, queryResponseXml);
  assert.equal(data.aeatLastQueryAt, queriedAt);
  assert.equal(data.aeatLastQueryEstadoRegistro, 'Correcto');
  assert.equal(data.aeatLastQueryCodigoErrorRegistro, '4100');
  assert.equal(data.aeatLastQueryDescripcionErrorRegistro, 'Accepted with warning');
  assert.equal((data.aeatLastQueryResult as { kind: string }).kind, 'response');
});

test('persistVerifactuQueryResponse stores SinDatos without rejecting the record', async () => {
  let updateArgs: unknown;
  const client = {
    verifactuRecord: {
      async findUnique() {
        return { status: 'GENERATED' as const };
      },
      async update(args: unknown) {
        updateArgs = args;

        return {
          id: 'verifactu_record_1',
          status: 'GENERATED' as const,
          aeatLastQueryEstadoRegistro: null,
          aeatLastQueryCodigoErrorRegistro: null,
          aeatLastQueryDescripcionErrorRegistro: null,
        };
      },
    },
  };

  const result = await persistVerifactuQueryResponse({
    client,
    verifactuRecordId: 'verifactu_record_1',
    responseXml: sinDatosResponseXml,
  });
  const data = (updateArgs as { data: Record<string, unknown> }).data;

  assert.equal(result.record.status, 'GENERATED');
  assert.equal(data.status, 'GENERATED');
  assert.equal(data.aeatLastQueryEstadoRegistro, null);
  assert.equal((data.aeatLastQueryResult as { resultadoConsulta: string }).resultadoConsulta, 'SinDatos');
});

test('persistVerifactuQueryResponse stores SOAP faults without rejecting the record', async () => {
  let updateArgs: unknown;
  const client = {
    verifactuRecord: {
      async findUnique() {
        return { status: 'SUBMITTED' as const };
      },
      async update(args: unknown) {
        updateArgs = args;

        return {
          id: 'verifactu_record_1',
          status: 'SUBMITTED' as const,
          aeatLastQueryEstadoRegistro: null,
          aeatLastQueryCodigoErrorRegistro: 'soapenv:Client',
          aeatLastQueryDescripcionErrorRegistro: 'Invalid query',
        };
      },
    },
  };

  const result = await persistVerifactuQueryResponse({
    client,
    verifactuRecordId: 'verifactu_record_1',
    responseXml: faultXml,
  });
  const data = (updateArgs as { data: Record<string, unknown> }).data;

  assert.equal(result.record.status, 'SUBMITTED');
  assert.equal(data.status, 'SUBMITTED');
  assert.equal(data.aeatLastQueryCodigoErrorRegistro, 'soapenv:Client');
  assert.equal(data.aeatLastQueryDescripcionErrorRegistro, 'Invalid query');
  assert.equal((data.aeatLastQueryResult as { kind: string }).kind, 'fault');
});

test('persistVerifactuQueryResponse does not downgrade accepted records', async () => {
  let updateArgs: unknown;
  const client = {
    verifactuRecord: {
      async findUnique() {
        return { status: 'ACCEPTED' as const };
      },
      async update(args: unknown) {
        updateArgs = args;

        return {
          id: 'verifactu_record_1',
          status: 'ACCEPTED' as const,
          aeatLastQueryEstadoRegistro: null,
          aeatLastQueryCodigoErrorRegistro: null,
          aeatLastQueryDescripcionErrorRegistro: null,
        };
      },
    },
  };

  const result = await persistVerifactuQueryResponse({
    client,
    verifactuRecordId: 'verifactu_record_1',
    responseXml: sinDatosResponseXml,
  });
  const data = (updateArgs as { data: Record<string, unknown> }).data;

  assert.equal(result.record.status, 'ACCEPTED');
  assert.equal(data.status, 'ACCEPTED');
});
