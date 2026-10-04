import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VerifactuRecordStatus } from '@prisma/client';
import {
  buildVerifactuBatchXml,
  preflightVerifactuRecordXml,
  runVerifactuSubmissionPass,
  verifactuSubmissionBatchSize,
} from './verifactu-submission';
import { buildVerifactuXml, validateVerifactuXmlWithXsd } from './verifactu-xml';
import type { VerifactuAltaPayload, VerifactuAnulacionPayload } from './verifactu-payload';
import type { VerifactuSoapConfig, VerifactuSoapTransportRequest } from './verifactu-soap';

const software = {
  producerName: 'Asienta Software SL',
  producerTaxId: 'B87654323',
  name: 'Asienta',
  id: 'AS',
  version: '1.0.0',
  installationNumber: 'inst-001',
  onlyVerifactu: 'S' as const,
  multiTaxpayerUse: 'N' as const,
  multipleTaxpayers: 'N' as const,
};

const altaPayload = (invoiceNumber: string): VerifactuAltaPayload => ({
  payloadVersion: '1.0',
  recordType: 'ALTA',
  subsanacion: null,
  rechazoPrevio: null,
  fiscalRecordId: 'e4cd5d64-124f-4635-9548-2ca1df11fa52',
  organizationId: '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab',
  invoiceId: '5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c',
  invoiceNumber,
  issueDate: '2026-05-27T00:00:00.000Z',
  sellerTaxId: 'B12345674',
  sellerLegalName: 'Seller Legal SL',
  sellerCountry: 'Spain',
  software,
  previousRecord: null,
  generationDateTimeWithTimezone: '2026-05-27T10:15:30+02:00',
  huellaType: '01',
  huella: 'B'.repeat(64),
  customer: { name: 'Customer SA', nif: 'A87654323', idOtro: null },
  customerCountry: 'Spain',
  currency: 'EUR',
  invoiceType: 'F1',
  operationDescription: 'Servicios profesionales',
  taxBreakdown: [{
    taxType: '01',
    taxRegimeKey: '01',
    operationClassification: 'S1',
    exemptOperation: null,
    taxRate: '21.00',
    taxableBaseAmount: '100.00',
    taxAmount: '21.00',
    equivalenceSurchargeRate: null,
    equivalenceSurchargeAmount: null,
  }],
  subtotalCents: 10000,
  discountCents: 0,
  taxCents: 2100,
  withholdingType: null,
  withholdingRate: null,
  withholdingAmountCents: null,
  totalCents: 12100,
  taxAmount: '21.00',
  totalAmount: '121.00',
  internalFiscalSequenceNumber: 1,
  internalPreviousHash: null,
  internalHash: 'internal-not-official',
});

const anulacionPayload = (invoiceNumber: string): VerifactuAnulacionPayload => ({
  payloadVersion: '1.0',
  recordType: 'ANULACION',
  fiscalRecordId: 'f05c3f4b-b22a-487b-a453-fc29bd39a4e7',
  organizationId: '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab',
  invoiceId: '5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c',
  invoiceNumber,
  issueDate: '2026-05-27T00:00:00.000Z',
  cancellationSequenceNumber: 2,
  sellerTaxId: 'B12345674',
  sellerLegalName: 'Seller Legal SL',
  sellerCountry: 'Spain',
  software,
  previousRecord: {
    sellerTaxId: 'B12345674',
    invoiceNumber,
    issueDate: '2026-05-27T00:00:00.000Z',
    huella: 'B'.repeat(64),
  },
  generationDateTimeWithTimezone: '2026-05-27T10:16:30+02:00',
  huellaType: '01',
  huella: 'C'.repeat(64),
  internalHash: 'internal-cancellation-not-official',
  internalPreviousHash: 'internal-not-official',
});

const config: VerifactuSoapConfig = {
  env: 'test',
  endpoint: 'https://prewww1.aeat.es/test',
  certPath: '/tmp/cert.p12',
};

const responseLine = (
  invoiceNumber: string,
  operacion: 'Alta' | 'Anulacion',
  estadoRegistro: string,
) => '<tikR:RespuestaLinea>' +
  '<tikR:IDFactura><tik:IDEmisorFactura>B12345674</tik:IDEmisorFactura>' +
  `<tik:NumSerieFactura>${invoiceNumber}</tik:NumSerieFactura>` +
  '<tik:FechaExpedicionFactura>27-05-2026</tik:FechaExpedicionFactura></tikR:IDFactura>' +
  `<tikR:Operacion><tik:TipoOperacion>${operacion}</tik:TipoOperacion></tikR:Operacion>` +
  `<tikR:EstadoRegistro>${estadoRegistro}</tikR:EstadoRegistro>` +
  '</tikR:RespuestaLinea>';

const responseXml = (lines: string[], tiempoEsperaEnvio = '30') =>
  '<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" ' +
  'xmlns:tikR="urn:respuesta" xmlns:tik="urn:suministro"><env:Body>' +
  '<tikR:RespuestaRegFactuSistemaFacturacion>' +
  '<tikR:CSV>CSV123</tikR:CSV>' +
  `<tikR:TiempoEsperaEnvio>${tiempoEsperaEnvio}</tikR:TiempoEsperaEnvio>` +
  '<tikR:EstadoEnvio>ParcialmenteCorrecto</tikR:EstadoEnvio>' +
  lines.join('') +
  '</tikR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>';

const faultXml = '<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">' +
  '<env:Body><env:Fault><faultcode>env:Server</faultcode>' +
  '<faultstring>Codigo[100].Error tecnico</faultstring></env:Fault></env:Body></env:Envelope>';

type FakeRecord = {
  id: string;
  organizationId: string;
  sequenceNumber: number;
  xml: string;
  recordType: 'ALTA' | 'ANULACION';
  invoiceNumber: string;
  issueDate: Date;
  status: VerifactuRecordStatus;
  preflightError?: string;
};

const fakeRecord = (
  id: string,
  sequenceNumber: number,
  payload: VerifactuAltaPayload | VerifactuAnulacionPayload,
  organizationId = 'org_1',
): FakeRecord => ({
  id,
  organizationId,
  sequenceNumber,
  xml: buildVerifactuXml(payload),
  recordType: payload.recordType,
  invoiceNumber: payload.invoiceNumber,
  issueDate: new Date(payload.issueDate),
  status: 'GENERATED',
});

const fakeClient = (records: FakeRecord[]) => {
  const findManyCalls: Record<string, unknown>[] = [];
  const isPending = (record: FakeRecord) =>
    record.status === 'GENERATED' || record.status === 'SUBMISSION_PENDING';
  const client = {
    verifactuRecord: {
      async findMany(args: Record<string, unknown> & { where: { organizationId?: string } }) {
        findManyCalls.push(args);
        const pending = records.filter(isPending);

        if (args.distinct) {
          return [...new Set(pending.map((record) => record.organizationId))]
            .map((organizationId) => ({ organizationId }));
        }

        return pending
          .filter((record) => record.organizationId === args.where.organizationId)
          .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
          .slice(0, args.take as number);
      },
      async findUnique({ where }: { where: { id: string } }) {
        const record = records.find((candidate) => candidate.id === where.id);

        return record
          ? {
              status: record.status,
              aeatEstadoEnvio: null,
              aeatEstadoRegistro: null,
              aeatCodigoErrorRegistro: null,
              aeatDescripcionErrorRegistro: null,
            }
          : null;
      },
      async update({ where, data }: {
        where: { id: string };
        data: {
          status: VerifactuRecordStatus;
          aeatEstadoRegistro?: string | null;
          preflightError?: string;
        };
      }) {
        const record = records.find((candidate) => candidate.id === where.id)!;

        record.status = data.status;
        record.preflightError = data.preflightError;

        return {
          id: record.id,
          status: record.status,
          aeatEstadoEnvio: null,
          aeatEstadoRegistro: data.aeatEstadoRegistro ?? null,
          aeatCodigoErrorRegistro: null,
          aeatDescripcionErrorRegistro: null,
        };
      },
    },
  };

  return { client: client as never, findManyCalls };
};

const silentLogger = { log() {}, error() {} };

test('buildVerifactuBatchXml combines records under one Cabecera and stays XSD-valid', async () => {
  const xml = buildVerifactuBatchXml([
    buildVerifactuXml(altaPayload('INV-2026-0001')),
    buildVerifactuXml(anulacionPayload('INV-2026-0001')),
  ]);

  assert.equal(xml.match(/<sfLR:Cabecera>/g)?.length, 1);
  assert.equal(xml.match(/<sfLR:RegistroFactura>/g)?.length, 2);
  assert.ok(xml.indexOf('<sf:RegistroAlta>') < xml.indexOf('<sf:RegistroAnulacion>'));
  assert.deepEqual(await validateVerifactuXmlWithXsd(xml), { ok: true });
});

test('buildVerifactuBatchXml rejects records with a different Cabecera', () => {
  const otherSeller = { ...altaPayload('INV-2026-0002'), sellerTaxId: 'B99999999' };

  assert.throws(
    () => buildVerifactuBatchXml([
      buildVerifactuXml(altaPayload('INV-2026-0001')),
      buildVerifactuXml(otherSeller),
    ]),
    /same Cabecera/,
  );
});

test('runVerifactuSubmissionPass submits pending records in chain order as one batch', async () => {
  const records = [
    fakeRecord('record_2', 2, altaPayload('INV-2026-0002')),
    fakeRecord('record_1', 1, altaPayload('INV-2026-0001')),
    fakeRecord('record_3', 3, anulacionPayload('INV-2026-0001')),
  ];
  const { client, findManyCalls } = fakeClient(records);
  const requests: VerifactuSoapTransportRequest[] = [];
  const nextSubmissionAt = new Map<string, number>();

  const result = await runVerifactuSubmissionPass({
    client,
    loadConfig: async () => config,
    nextSubmissionAt,
    logger: silentLogger,
    now: () => 1_000,
    async transport(request) {
      requests.push(request);

      // AEAT lines are matched by invoice ID and operation, not position.
      return {
        status: 200,
        body: responseXml([
          responseLine('INV-2026-0001', 'Anulacion', 'Correcto'),
          responseLine('INV-2026-0002', 'Alta', 'Incorrecto'),
          responseLine('INV-2026-0001', 'Alta', 'AceptadoConErrores'),
        ]),
      };
    },
  });

  assert.deepEqual(result, { organizationCount: 1, submittedCount: 3 });
  assert.equal(requests.length, 1);
  assert.deepEqual(
    [...requests[0]!.body.matchAll(/<sf:NumSerieFactura>([^<]+)</g)].map((match) => match[1]),
    ['INV-2026-0001', 'INV-2026-0002', 'INV-2026-0001'],
  );
  assert.ok(requests[0]!.body.indexOf('<sf:RegistroAnulacion>') >
    requests[0]!.body.lastIndexOf('<sf:RegistroAlta>'));
  assert.deepEqual(
    Object.fromEntries(records.map((record) => [record.id, record.status])),
    { record_1: 'ACCEPTED_WITH_ERRORS', record_2: 'REJECTED', record_3: 'ACCEPTED' },
  );
  assert.deepEqual(findManyCalls[1]?.orderBy, { invoiceFiscalRecord: { sequenceNumber: 'asc' } });
  assert.equal(findManyCalls[1]?.take, verifactuSubmissionBatchSize);
  assert.equal(nextSubmissionAt.get('org_1'), 1_000 + 30_000);
});

test('preflightVerifactuRecordXml flags invalid NIFs and XSD errors', async () => {
  assert.deepEqual(
    await preflightVerifactuRecordXml(buildVerifactuXml(altaPayload('INV-2026-0001'))),
    [],
  );

  const errors = await preflightVerifactuRecordXml(buildVerifactuXml({
    ...altaPayload('INV-2026-0001'),
    sellerTaxId: 'ES56712340987',
    customer: { name: 'Customer SA', nif: 'A87654321', idOtro: null },
  }));

  assert.deepEqual(errors.slice(0, 3), [
    'Invalid NIF in ObligadoEmision: ES56712340987',
    'Invalid NIF in IDFactura: ES56712340987',
    'Invalid NIF in IDDestinatario: A87654321',
  ]);
  assert.match(errors[3]!, /^XSD validation failed: /);
});

test('runVerifactuSubmissionPass leaves pre-flight failures out of the batch', async () => {
  const invalidCustomer = {
    ...altaPayload('INV-2026-0002'),
    customer: { name: 'Customer SA', nif: 'A87654321', idOtro: null },
  };
  const records = [
    fakeRecord('record_1', 1, altaPayload('INV-2026-0001')),
    fakeRecord('record_2', 2, invalidCustomer),
    fakeRecord('record_3', 3, altaPayload('INV-2026-0003')),
  ];
  const { client } = fakeClient(records);
  const requests: VerifactuSoapTransportRequest[] = [];

  const result = await runVerifactuSubmissionPass({
    client,
    loadConfig: async () => config,
    nextSubmissionAt: new Map(),
    logger: silentLogger,
    now: () => 0,
    async transport(request) {
      requests.push(request);

      return {
        status: 200,
        body: responseXml([
          responseLine('INV-2026-0001', 'Alta', 'Correcto'),
          responseLine('INV-2026-0003', 'Alta', 'Correcto'),
        ]),
      };
    },
  });

  assert.deepEqual(result, { organizationCount: 1, submittedCount: 2 });
  assert.deepEqual(
    [...requests[0]!.body.matchAll(/<sf:NumSerieFactura>([^<]+)</g)].map((match) => match[1]),
    ['INV-2026-0001', 'INV-2026-0003'],
  );
  assert.deepEqual(
    Object.fromEntries(records.map((record) => [record.id, record.status])),
    { record_1: 'ACCEPTED', record_2: 'PREFLIGHT_FAILED', record_3: 'ACCEPTED' },
  );
  assert.equal(records[1]!.preflightError, 'Invalid NIF in IDDestinatario: A87654321');
});

test('runVerifactuSubmissionPass skips AEAT when every record fails pre-flight', async () => {
  const records = [
    fakeRecord('record_1', 1, { ...altaPayload('INV-2026-0001'), sellerTaxId: 'B12345678' }),
  ];
  const { client } = fakeClient(records);
  let transportCalls = 0;

  const result = await runVerifactuSubmissionPass({
    client,
    loadConfig: async () => config,
    nextSubmissionAt: new Map(),
    logger: silentLogger,
    now: () => 0,
    async transport() {
      transportCalls += 1;

      return { status: 200, body: responseXml([]) };
    },
  });

  assert.deepEqual(result, { organizationCount: 1, submittedCount: 0 });
  assert.equal(transportCalls, 0);
  assert.equal(records[0]!.status, 'PREFLIGHT_FAILED');
});

test('runVerifactuSubmissionPass waits for the AEAT TiempoEsperaEnvio window', async () => {
  const records = [fakeRecord('record_1', 1, altaPayload('INV-2026-0001'))];
  const { client } = fakeClient(records);
  let transportCalls = 0;

  const result = await runVerifactuSubmissionPass({
    client,
    loadConfig: async () => config,
    nextSubmissionAt: new Map([['org_1', 61_000]]),
    logger: silentLogger,
    now: () => 60_999,
    async transport() {
      transportCalls += 1;

      return { status: 200, body: responseXml([]) };
    },
  });

  assert.deepEqual(result, { organizationCount: 1, submittedCount: 0 });
  assert.equal(transportCalls, 0);
  assert.equal(records[0]!.status, 'GENERATED');
});

test('runVerifactuSubmissionPass keeps records pending on SOAP faults and backs off', async () => {
  const records = [fakeRecord('record_1', 1, altaPayload('INV-2026-0001'))];
  const { client } = fakeClient(records);
  const nextSubmissionAt = new Map<string, number>();

  await runVerifactuSubmissionPass({
    client,
    loadConfig: async () => config,
    nextSubmissionAt,
    logger: silentLogger,
    now: () => 0,
    async transport() {
      return { status: 500, body: faultXml };
    },
  });

  assert.equal(records[0]!.status, 'GENERATED');
  assert.equal(nextSubmissionAt.get('org_1'), 60_000);
});

test('runVerifactuSubmissionPass keeps records pending on unrecognized responses', async () => {
  const records = [fakeRecord('record_1', 1, altaPayload('INV-2026-0001'))];
  const { client } = fakeClient(records);
  const nextSubmissionAt = new Map<string, number>();
  const errors: unknown[][] = [];

  const result = await runVerifactuSubmissionPass({
    client,
    config,
    nextSubmissionAt,
    logger: { log() {}, error: (...args: unknown[]) => errors.push(args) },
    now: () => 0,
    async transport() {
      return { status: 502, body: '<html><body>502 Bad Gateway</body></html>' };
    },
  });

  assert.deepEqual(result, { organizationCount: 1, submittedCount: 0 });
  assert.equal(records[0]!.status, 'GENERATED');
  assert.match(String(errors[0]![2]), /Unrecognized AEAT response \(HTTP 502\)/);
  assert.equal(nextSubmissionAt.get('org_1'), 60_000);
});

test('runVerifactuSubmissionPass isolates transport errors per organization', async () => {
  const records = [
    fakeRecord('record_1', 1, altaPayload('INV-2026-0001'), 'org_1'),
    fakeRecord('record_2', 1, altaPayload('INV-2026-0002'), 'org_2'),
  ];
  const { client } = fakeClient(records);
  const nextSubmissionAt = new Map<string, number>();
  const errors: unknown[][] = [];

  const result = await runVerifactuSubmissionPass({
    client,
    loadConfig: async () => config,
    nextSubmissionAt,
    logger: { log() {}, error: (...args: unknown[]) => errors.push(args) },
    now: () => 0,
    async transport(request) {
      if (request.body.includes('INV-2026-0001')) {
        throw new Error('ECONNRESET');
      }

      return {
        status: 200,
        body: responseXml([responseLine('INV-2026-0002', 'Alta', 'Correcto')]),
      };
    },
  });

  assert.deepEqual(result, { organizationCount: 2, submittedCount: 1 });
  assert.equal(records[0]!.status, 'GENERATED');
  assert.equal(records[1]!.status, 'ACCEPTED');
  assert.equal(errors.length, 1);
  assert.equal(errors[0]![1], 'org_1');
  assert.equal(nextSubmissionAt.get('org_1'), 60_000);
  assert.equal(nextSubmissionAt.get('org_2'), 30_000);
});

test('runVerifactuSubmissionPass skips organizations without a usable certificate', async () => {
  const records = [
    fakeRecord('record_1', 1, altaPayload('INV-2026-0001'), 'org_1'),
    fakeRecord('record_2', 1, altaPayload('INV-2026-0002'), 'org_2'),
  ];
  const { client } = fakeClient(records);
  const nextSubmissionAt = new Map<string, number>();
  const errors: unknown[][] = [];
  const endpoints: string[] = [];

  const result = await runVerifactuSubmissionPass({
    client,
    async loadConfig(organizationId) {
      if (organizationId === 'org_1') {
        throw new Error('Organization org_1 has no Veri*Factu certificate.');
      }

      return { ...config, endpoint: 'https://prewww10.aeat.es/org_2' };
    },
    nextSubmissionAt,
    logger: { log() {}, error: (...args: unknown[]) => errors.push(args) },
    now: () => 0,
    async transport(request) {
      endpoints.push(request.endpoint);

      return {
        status: 200,
        body: responseXml([responseLine('INV-2026-0002', 'Alta', 'Correcto')]),
      };
    },
  });

  assert.deepEqual(result, { organizationCount: 2, submittedCount: 1 });
  assert.deepEqual(endpoints, ['https://prewww10.aeat.es/org_2']);
  assert.equal(records[0]!.status, 'GENERATED');
  assert.equal(errors[0]![1], 'org_1');
  assert.equal(nextSubmissionAt.get('org_1'), 60_000);
});
