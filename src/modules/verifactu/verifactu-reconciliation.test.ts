import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InvoiceFiscalRecordType, VerifactuRecordStatus } from '@prisma/client';
import {
  reconcileSubmittedVerifactuRecords,
  verifactuReconciliationBatchSize,
} from './verifactu-reconciliation';
import type { VerifactuSoapConfig, VerifactuSoapTransportRequest } from './verifactu-soap';

const config: VerifactuSoapConfig = {
  env: 'test',
  endpoint: 'https://prewww1.aeat.es/test',
  certPath: '/tmp/cert.p12',
};

const queryResponseXml = (estadoRegistro: string | null) =>
  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
  'xmlns:sfLRRC="urn:respuesta-consulta"><soapenv:Body>' +
  '<sfLRRC:RespuestaConsultaFactuSistemaFacturacion>' +
  `<sfLRRC:ResultadoConsulta>${estadoRegistro ? 'ConDatos' : 'SinDatos'}` +
  '</sfLRRC:ResultadoConsulta>' +
  (estadoRegistro
    ? '<sfLRRC:RegistroRespuestaConsultaFactuSistemaFacturacion><sfLRRC:EstadoRegistro>' +
      `<sfLRRC:EstadoRegistro>${estadoRegistro}</sfLRRC:EstadoRegistro>` +
      '</sfLRRC:EstadoRegistro></sfLRRC:RegistroRespuestaConsultaFactuSistemaFacturacion>'
    : '') +
  '</sfLRRC:RespuestaConsultaFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>';

type FakeRecord = {
  id: string;
  organizationId: string;
  recordType: InvoiceFiscalRecordType;
  invoiceNumber: string;
  status: VerifactuRecordStatus;
  aeatEnvironment: 'TEST' | 'PRODUCTION';
};

const fakeRecord = (
  id: string,
  invoiceNumber: string,
  recordType: InvoiceFiscalRecordType = 'ALTA',
  organizationId = 'org_1',
): FakeRecord => ({
  id,
  organizationId,
  recordType,
  invoiceNumber,
  status: 'SUBMITTED',
  aeatEnvironment: 'TEST',
});

const fakeClient = (records: FakeRecord[]) => {
  const findManyCalls: Record<string, unknown>[] = [];
  const client = {
    verifactuRecord: {
      async findMany(args: Record<string, unknown> & { where: { aeatEnvironment: string } }) {
        findManyCalls.push(args);

        return records
          .filter((record) =>
            record.status === 'SUBMITTED' &&
            record.aeatEnvironment === args.where.aeatEnvironment)
          .map((record) => ({
            id: record.id,
            organizationId: record.organizationId,
            sellerTaxId: 'B12345674',
            invoiceNumber: record.invoiceNumber,
            issueDate: new Date('2026-05-27T00:00:00.000Z'),
            invoice: { snapshot: { sellerName: 'Seller', sellerLegalName: 'Seller Legal SL' } },
          }));
      },
      async findUnique({ where }: { where: { id: string } }) {
        const record = records.find((candidate) => candidate.id === where.id)!;

        return { status: record.status, recordType: record.recordType };
      },
      async update({ where, data }: {
        where: { id: string };
        data: { status: VerifactuRecordStatus };
      }) {
        const record = records.find((candidate) => candidate.id === where.id)!;

        record.status = data.status;

        return { id: record.id, status: record.status };
      },
    },
  };

  return { client: client as never, findManyCalls };
};

test('reconcileSubmittedVerifactuRecords stores the state AEAT registered', async () => {
  const records = [
    fakeRecord('alta_correcto', 'INV-1'),
    fakeRecord('alta_errores', 'INV-2'),
    fakeRecord('alta_anulado', 'INV-3'),
    fakeRecord('alta_sin_datos', 'INV-4'),
    fakeRecord('anulacion_anulado', 'INV-5', 'ANULACION'),
    fakeRecord('anulacion_correcto', 'INV-6', 'ANULACION'),
  ];
  const estados: Record<string, string | null> = {
    'INV-1': 'Correcto',
    'INV-2': 'AceptadoConErrores',
    'INV-3': 'Anulado',
    'INV-4': null,
    'INV-5': 'Anulado',
    'INV-6': 'Correcto',
  };
  const { client, findManyCalls } = fakeClient(records);
  const requests: VerifactuSoapTransportRequest[] = [];

  const result = await reconcileSubmittedVerifactuRecords({
    client,
    aeatEnvironment: 'TEST',
    loadConfig: async () => config,
    now: () => Date.parse('2026-05-27T12:00:00.000Z'),
    async transport(request) {
      requests.push(request);
      const invoiceNumber = request.body.match(/<sfLRC:NumSerieFactura>([^<]+)</)![1]!;

      return { status: 200, body: queryResponseXml(estados[invoiceNumber]!) };
    },
  });

  assert.equal(requests.length, 6);
  assert.deepEqual(
    Object.fromEntries(records.map((record) => [record.id, record.status])),
    {
      alta_correcto: 'ACCEPTED',
      alta_errores: 'ACCEPTED_WITH_ERRORS',
      alta_anulado: 'ACCEPTED',
      alta_sin_datos: 'GENERATED',
      anulacion_anulado: 'ACCEPTED',
      anulacion_correcto: 'GENERATED',
    },
  );
  assert.deepEqual(result, {
    checkedCount: 6,
    statuses: { ACCEPTED: 3, ACCEPTED_WITH_ERRORS: 1, GENERATED: 2 },
    errorCount: 0,
  });
  assert.deepEqual(findManyCalls[0]?.where, {
    status: 'SUBMITTED',
    aeatEnvironment: 'TEST',
    updatedAt: { lt: new Date('2026-05-27T11:45:00.000Z') },
  });
  assert.equal(findManyCalls[0]?.take, verifactuReconciliationBatchSize);
});

test('reconcileSubmittedVerifactuRecords keeps records SUBMITTED on failures', async () => {
  const records = [
    fakeRecord('record_fault', 'INV-1'),
    fakeRecord('record_error', 'INV-2'),
    fakeRecord('record_ok', 'INV-3'),
    fakeRecord('record_html', 'INV-4'),
  ];
  const { client } = fakeClient(records);
  const errors: unknown[][] = [];

  const result = await reconcileSubmittedVerifactuRecords({
    client,
    aeatEnvironment: 'TEST',
    loadConfig: async () => config,
    logger: { error: (...args: unknown[]) => errors.push(args) },
    async transport(request) {
      if (request.body.includes('INV-1')) {
        return {
          status: 500,
          body: '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
            '<soapenv:Body><soapenv:Fault><faultcode>soapenv:Server</faultcode>' +
            '<faultstring>Error tecnico</faultstring></soapenv:Fault></soapenv:Body>' +
            '</soapenv:Envelope>',
        };
      }

      if (request.body.includes('INV-2')) {
        throw new Error('ECONNRESET');
      }

      if (request.body.includes('INV-4')) {
        return { status: 502, body: '<html><body>Bad Gateway</body></html>' };
      }

      return { status: 200, body: queryResponseXml('Correcto') };
    },
  });

  assert.deepEqual(
    Object.fromEntries(records.map((record) => [record.id, record.status])),
    {
      record_fault: 'SUBMITTED',
      record_error: 'SUBMITTED',
      record_ok: 'ACCEPTED',
      record_html: 'SUBMITTED',
    },
  );
  assert.deepEqual(result.statuses, { ACCEPTED: 1 });
  assert.equal(result.errorCount, 3);
  assert.deepEqual(
    errors.map((args) => args[1]),
    ['record_fault', 'record_error', 'record_html'],
  );
});

test('reconcileSubmittedVerifactuRecords leaves records of other AEAT environments', async () => {
  const records = [fakeRecord('test_record', 'INV-1')];
  const { client } = fakeClient(records);
  let requestCount = 0;

  // AEAT production has no trace of preproduction records, so querying them
  // there would send them back to GENERATED for resubmission.
  const result = await reconcileSubmittedVerifactuRecords({
    client,
    aeatEnvironment: 'PRODUCTION',
    loadConfig: async () => config,
    async transport() {
      requestCount += 1;

      return { status: 200, body: queryResponseXml(null) };
    },
  });

  assert.equal(requestCount, 0);
  assert.equal(records[0]!.status, 'SUBMITTED');
  assert.equal(result.checkedCount, 0);
});

test('reconcileSubmittedVerifactuRecords queries with each organization config', async () => {
  const records = [
    fakeRecord('record_1', 'INV-1', 'ALTA', 'org_1'),
    fakeRecord('record_2', 'INV-2', 'ALTA', 'org_2'),
    fakeRecord('record_3', 'INV-3', 'ALTA', 'org_1'),
  ];
  const { client } = fakeClient(records);
  const loadedOrganizations: string[] = [];
  const endpoints: string[] = [];

  await reconcileSubmittedVerifactuRecords({
    client,
    aeatEnvironment: 'TEST',
    async loadConfig(organizationId) {
      loadedOrganizations.push(organizationId);

      return { ...config, endpoint: `https://prewww1.aeat.es/${organizationId}` };
    },
    async transport(request) {
      endpoints.push(request.endpoint);

      return { status: 200, body: queryResponseXml('Correcto') };
    },
  });

  assert.deepEqual(loadedOrganizations, ['org_1', 'org_2']);
  assert.deepEqual(endpoints, [
    'https://prewww1.aeat.es/org_1',
    'https://prewww1.aeat.es/org_2',
    'https://prewww1.aeat.es/org_1',
  ]);
});
