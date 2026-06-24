import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  buildVerifactuPayload,
  buildVerifactuPayloadForFiscalRecord,
  VerifactuPayloadValidationError,
  type BuildVerifactuPayloadOptions,
  type InvoiceFiscalRecordWithInvoiceSnapshot,
} from './verifactu-payload';

const organizationId = '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab';
const invoiceId = '5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c';
const fiscalRecordId = 'e4cd5d64-124f-4635-9548-2ca1df11fa52';
const previousHuella = 'A'.repeat(64);
const previousVerifactuRecordId = '7d099fc2-225e-4f00-b35a-b1fdc1b62d4e';

const storedSoftwareConfig = () => ({
  producerName: 'Stored Producer SL',
  producerTaxId: 'B11223344',
  softwareName: 'Stored SIF',
  softwareId: 'SIF01',
  softwareVersion: '2.3.4',
  installationNumber: 'stored-installation-001',
  onlyVerifactu: 'S',
  multiTaxpayerUse: 'N',
  multipleTaxpayers: 'N',
} as const);

const storedTaxBreakdown = () => [
  {
    taxType: '01',
    taxRegimeKey: '01',
    operationClassification: 'S1',
    exemptOperation: null,
    taxRate: '10.00',
    taxableBaseAmount: '90.00',
    taxAmount: '9.00',
    equivalenceSurchargeRate: null,
    equivalenceSurchargeAmount: null,
  },
];

export const baseVerifactuOptions = (): BuildVerifactuPayloadOptions => ({
  generationDateTimeWithTimezone: '2026-05-27T10:15:30+02:00',
  previousRecord: {
    sellerTaxId: 'B12345678',
    invoiceNumber: 'INV-2026-0000',
    issueDate: '2026-05-26T00:00:00.000Z',
    huella: previousHuella,
  },
  softwareConfig: storedSoftwareConfig(),
});

const baseRecord = (): InvoiceFiscalRecordWithInvoiceSnapshot => ({
  id: fiscalRecordId,
  organizationId,
  invoiceId,
  type: 'ALTA',
  sequenceNumber: 7,
  previousHash: 'previous-internal-hash',
  hash: 'current-internal-hash',
  invoiceType: 'F2',
  operationDescription: 'Stored fiscal operation',
  taxBreakdown: storedTaxBreakdown(),
  verifactuRecord: null,
  invoice: {
    id: invoiceId,
    organizationId,
    number: 'INV-2026-0001',
    issueDate: new Date('2026-05-27T00:00:00.000Z'),
    currency: 'EUR',
    snapshot: {
      sellerName: 'Snapshot Trading Name',
      sellerLegalName: 'Snapshot Legal SL',
      sellerTaxId: 'B12345678',
      sellerCountry: 'Spain',
      customerName: 'Snapshot Customer SA',
      customerTaxId: 'A87654321',
      customerCountry: 'Spain',
      subtotalCents: 10000,
      discountCents: 500,
      taxCents: 1995,
      withholdingType: 'IRPF',
      withholdingRate: new Prisma.Decimal('15'),
      withholdingAmountCents: 1500,
      totalCents: 9995,
    },
  },
});

test('buildVerifactuPayload builds an ALTA payload from a fiscal record snapshot', () => {
  const payload = buildVerifactuPayload(baseRecord(), baseVerifactuOptions());

  assert.equal(payload.recordType, 'ALTA');
  assert.equal(payload.payloadVersion, '1.0');
  assert.equal(payload.fiscalRecordId, fiscalRecordId);
  assert.equal(payload.organizationId, organizationId);
  assert.equal(payload.invoiceId, invoiceId);
  assert.equal(payload.invoiceNumber, 'INV-2026-0001');
  assert.equal(payload.issueDate, '2026-05-27T00:00:00.000Z');
  assert.equal(payload.sellerTaxId, 'B12345678');
  assert.equal(payload.sellerLegalName, 'Snapshot Legal SL');
  assert.equal(payload.customer.name, 'Snapshot Customer SA');
  assert.equal(payload.customer.nif, 'A87654321');
  assert.equal(payload.invoiceType, 'F2');
  assert.equal(payload.operationDescription, 'Stored fiscal operation');
  assert.equal(payload.taxAmount, '19.95');
  assert.equal(payload.totalAmount, '99.95');
  assert.deepEqual(payload.taxBreakdown, storedTaxBreakdown());
  assert.equal(payload.internalFiscalSequenceNumber, 7);
  assert.equal(payload.internalPreviousHash, 'previous-internal-hash');
  assert.equal(payload.internalHash, 'current-internal-hash');
  assert.match(payload.huella, /^[A-F0-9]{64}$/);
});

test('buildVerifactuPayload uses persisted software config data', () => {
  const payload = buildVerifactuPayload(baseRecord(), baseVerifactuOptions());

  assert.deepEqual(payload.software, {
    producerName: 'Stored Producer SL',
    producerTaxId: 'B11223344',
    name: 'Stored SIF',
    id: 'SIF01',
    version: '2.3.4',
    installationNumber: 'stored-installation-001',
    onlyVerifactu: 'S',
    multiTaxpayerUse: 'N',
    multipleTaxpayers: 'N',
  });
});

test('buildVerifactuPayload uses persisted invoice fiscal data', () => {
  const record = baseRecord();
  record.invoiceType = 'R1';
  record.operationDescription = 'Persisted rectification';
  record.taxBreakdown = [{
    taxType: '01',
    taxRegimeKey: '03',
    operationClassification: 'S1',
    exemptOperation: null,
    taxRate: '4.00',
    taxableBaseAmount: '50.00',
    taxAmount: '2.00',
    equivalenceSurchargeRate: null,
    equivalenceSurchargeAmount: null,
  }];

  const payload = buildVerifactuPayload(record, baseVerifactuOptions());

  assert.equal(payload.recordType, 'ALTA');
  assert.equal(payload.invoiceType, 'R1');
  assert.equal(payload.operationDescription, 'Persisted rectification');
  assert.deepEqual(payload.taxBreakdown, record.taxBreakdown);
});

test('buildVerifactuPayload builds an ANULACION payload from a fiscal record snapshot', () => {
  const payload = buildVerifactuPayload({
    ...baseRecord(),
    type: 'ANULACION',
    sequenceNumber: 8,
    previousHash: 'alta-internal-hash',
    hash: 'cancellation-internal-hash',
  }, baseVerifactuOptions());

  assert.equal(payload.recordType, 'ANULACION');
  assert.equal(payload.cancellationSequenceNumber, 8);
  assert.equal(payload.sellerTaxId, 'B12345678');
  assert.equal(payload.invoiceNumber, 'INV-2026-0001');
  assert.equal(payload.internalHash, 'cancellation-internal-hash');
  assert.equal(payload.internalPreviousHash, 'alta-internal-hash');
  assert.match(payload.huella, /^[A-F0-9]{64}$/);
});

test('buildVerifactuPayload uses snapshot seller and customer data over live data', () => {
  const record = {
    ...baseRecord(),
    invoice: {
      ...baseRecord().invoice,
      organization: {
        name: 'Live Seller Name',
        legalName: 'Live Seller Legal SL',
        taxId: 'LIVESELLER',
        countryCode: 'GB',
      },
      customer: {
        name: 'Live Customer Ltd',
        taxId: 'LIVECUSTOMER',
        country: 'United Kingdom',
      },
    },
  } as InvoiceFiscalRecordWithInvoiceSnapshot;

  const payload = buildVerifactuPayload(record, baseVerifactuOptions());

  assert.equal(payload.sellerTaxId, 'B12345678');
  assert.equal(payload.sellerLegalName, 'Snapshot Legal SL');
  assert.equal(payload.sellerCountry, 'Spain');
  assert.equal(payload.recordType, 'ALTA');
  assert.equal(payload.customer.name, 'Snapshot Customer SA');
  assert.equal(payload.customer.nif, 'A87654321');
  assert.equal(payload.customerCountry, 'Spain');
});

test('buildVerifactuPayload rejects a missing invoice snapshot', () => {
  assert.throws(
    () => buildVerifactuPayload({
      ...baseRecord(),
      invoice: {
        ...baseRecord().invoice,
        snapshot: null,
      },
    }, baseVerifactuOptions()),
    /requires an invoice snapshot/,
  );
});

test('buildVerifactuPayload rejects a missing seller tax ID', () => {
  const record = baseRecord();
  record.invoice.snapshot!.sellerTaxId = '  ';

  assert.throws(
    () => buildVerifactuPayload(record, baseVerifactuOptions()),
    /requires a seller tax ID/,
  );
});

test('buildVerifactuPayload rejects a missing invoice number', () => {
  assert.throws(
    () => buildVerifactuPayload({
      ...baseRecord(),
      invoice: {
        ...baseRecord().invoice,
        number: ' ',
      },
    }, baseVerifactuOptions()),
    /requires an invoice number/,
  );
});

test('buildVerifactuPayload rejects missing real ALTA fiscal details', () => {
  const record = baseRecord();
  record.invoiceType = null;

  assert.throws(
    () => buildVerifactuPayload(record, baseVerifactuOptions()),
    /requires persisted InvoiceFiscalRecord\.invoiceType/,
  );
});

test('buildVerifactuPayload rejects missing persisted software config fields', () => {
  const options = baseVerifactuOptions();
  options.softwareConfig = {
    ...storedSoftwareConfig(),
    producerTaxId: '  ',
  };

  assert.throws(
    () => buildVerifactuPayload(baseRecord(), options),
    {
      name: 'VerifactuPayloadValidationError',
      message: /requires persisted VerifactuSoftwareConfig\.producerTaxId/,
    },
  );
});

test('buildVerifactuPayload rejects invalid persisted software config flags', () => {
  const options = baseVerifactuOptions();
  options.softwareConfig = {
    ...storedSoftwareConfig(),
    onlyVerifactu: 'X',
  };

  assert.throws(
    () => buildVerifactuPayload(baseRecord(), options),
    /requires persisted VerifactuSoftwareConfig\.onlyVerifactu to be S or N/,
  );
});

test('buildVerifactuPayload rejects missing persisted operation description', () => {
  const record = baseRecord();
  record.operationDescription = null;

  assert.throws(
    () => buildVerifactuPayload(record, baseVerifactuOptions()),
    /requires persisted InvoiceFiscalRecord\.operationDescription/,
  );
});

test('buildVerifactuPayload rejects empty persisted tax breakdown', () => {
  const record = baseRecord();
  record.taxBreakdown = [];

  assert.throws(
    () => buildVerifactuPayload(record, baseVerifactuOptions()),
    /requires persisted InvoiceFiscalRecord\.taxBreakdown as a non-empty array/,
  );
});

test('buildVerifactuPayload rejects non-object tax breakdown entries', () => {
  const record = baseRecord();
  record.taxBreakdown = ['bad-entry'];

  assert.throws(
    () => buildVerifactuPayload(record, baseVerifactuOptions()),
    /requires persisted InvoiceFiscalRecord\.taxBreakdown\[0\] to be an object/,
  );
});

test('buildVerifactuPayload rejects missing required tax breakdown fields', () => {
  const record = baseRecord();
  record.taxBreakdown = [{
    ...storedTaxBreakdown()[0],
    taxType: ' ',
  }];

  assert.throws(
    () => buildVerifactuPayload(record, baseVerifactuOptions()),
    /requires persisted InvoiceFiscalRecord\.taxBreakdown\[0\]\.taxType/,
  );
});

test('buildVerifactuPayload rejects invalid tax breakdown decimal fields', () => {
  const record = baseRecord();
  record.taxBreakdown = [{
    ...storedTaxBreakdown()[0],
    taxableBaseAmount: 'not-decimal',
  }];

  assert.throws(
    () => buildVerifactuPayload(record, baseVerifactuOptions()),
    /requires persisted InvoiceFiscalRecord\.taxBreakdown\[0\]\.taxableBaseAmount to be a decimal string/,
  );
});

test('buildVerifactuPayload rejects omitted optional tax breakdown keys', () => {
  const record = baseRecord();
  record.taxBreakdown = [{
    taxType: '01',
    taxRegimeKey: '01',
    operationClassification: 'S1',
    exemptOperation: null,
    taxRate: '10.00',
    taxableBaseAmount: '90.00',
    taxAmount: '9.00',
    equivalenceSurchargeRate: null,
  }];

  assert.throws(
    () => buildVerifactuPayload(record, baseVerifactuOptions()),
    /requires persisted InvoiceFiscalRecord\.taxBreakdown\[0\]\.equivalenceSurchargeAmount to be text or null/,
  );
});

test('VerifactuPayloadValidationError identifies payload validation failures', () => {
  const record = baseRecord();
  record.invoiceType = null;

  assert.throws(
    () => buildVerifactuPayload(record, baseVerifactuOptions()),
    VerifactuPayloadValidationError,
  );
});

test('buildVerifactuPayload keeps internal and official hash values separate', () => {
  const payload = buildVerifactuPayload(baseRecord(), baseVerifactuOptions());
  const payloadKeys = Object.keys(payload);

  assert.equal(payload.internalHash, 'current-internal-hash');
  assert.notEqual(payload.huella, payload.internalHash);
  assert.equal(payloadKeys.includes('hash'), false);
  assert.equal(payloadKeys.includes('previousHash'), false);
  assert.equal(payloadKeys.includes('officialHash'), false);
  assert.equal(payloadKeys.includes('verifactuHash'), false);
});

test('buildVerifactuPayload does not generate XML', () => {
  const payload = buildVerifactuPayload(baseRecord(), baseVerifactuOptions());
  const serializedPayload = JSON.stringify(payload);

  assert.equal(typeof payload, 'object');
  assert.notEqual(typeof payload, 'string');
  assert.equal(Object.keys(payload).includes('xml'), false);
  assert.equal(serializedPayload.includes('<?xml'), false);
  assert.equal(serializedPayload.includes('<Registro'), false);
});

test('buildVerifactuPayload does not call AEAT or any network API', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('Unexpected network call');
  }) as typeof fetch;

  try {
    buildVerifactuPayload(baseRecord(), baseVerifactuOptions());
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalls, 0);
});

test('buildVerifactuPayloadForFiscalRecord supports a first record with no previousRecord', async () => {
  const client = {
    invoiceFiscalRecord: {
      async findUnique() {
        return baseRecord();
      },
    },
    verifactuRecord: {
      async findFirst() {
        return null;
      },
    },
    verifactuSoftwareConfig: {
      async findFirst() {
        return storedSoftwareConfig();
      },
    },
  };

  const result = await buildVerifactuPayloadForFiscalRecord(client as never, fiscalRecordId);

  assert.equal(result.previousVerifactuRecordId, null);
  assert.equal(result.payload.previousRecord, null);
  assert.match(result.payload.huella, /^[A-F0-9]{64}$/);
});

test('buildVerifactuPayloadForFiscalRecord resolves the previous valid record', async () => {
  let previousWhere: unknown;
  const client = {
    invoiceFiscalRecord: {
      async findUnique() {
        return baseRecord();
      },
    },
    verifactuRecord: {
      async findFirst(args: { where: unknown }) {
        previousWhere = args.where;

        return {
          id: previousVerifactuRecordId,
          sellerTaxId: 'B12345678',
          invoiceNumber: 'INV-2026-0000',
          issueDate: new Date('2026-05-26T00:00:00.000Z'),
          huella: previousHuella,
        };
      },
    },
    verifactuSoftwareConfig: {
      async findFirst() {
        return storedSoftwareConfig();
      },
    },
  };

  const result = await buildVerifactuPayloadForFiscalRecord(client as never, fiscalRecordId);

  assert.equal(result.previousVerifactuRecordId, previousVerifactuRecordId);
  assert.deepEqual(result.payload.previousRecord, {
    sellerTaxId: 'B12345678',
    invoiceNumber: 'INV-2026-0000',
    issueDate: '2026-05-26T00:00:00.000Z',
    huella: previousHuella,
  });
  assert.deepEqual(previousWhere, {
    organizationId,
    status: { not: 'REJECTED' },
    invoiceFiscalRecord: {
      sequenceNumber: {
        lt: 7,
      },
    },
  });
});

test('buildVerifactuPayloadForFiscalRecord reuses persisted generation timestamp', async () => {
  const client = {
    invoiceFiscalRecord: {
      async findUnique() {
        return {
          ...baseRecord(),
          verifactuRecord: {
            generationDateTimeWithTimezone: '2026-05-27T12:30:45+02:00',
          },
        };
      },
    },
    verifactuRecord: {
      async findFirst() {
        return null;
      },
    },
    verifactuSoftwareConfig: {
      async findFirst() {
        return storedSoftwareConfig();
      },
    },
  };

  const first = await buildVerifactuPayloadForFiscalRecord(client as never, fiscalRecordId);
  const second = await buildVerifactuPayloadForFiscalRecord(client as never, fiscalRecordId);

  assert.equal(
    first.payload.generationDateTimeWithTimezone,
    '2026-05-27T12:30:45+02:00',
  );
  assert.equal(
    second.payload.generationDateTimeWithTimezone,
    '2026-05-27T12:30:45+02:00',
  );
  assert.equal(first.payload.huella, second.payload.huella);
});

test('buildVerifactuPayloadForFiscalRecord rejects missing default software config', async () => {
  const client = {
    invoiceFiscalRecord: {
      async findUnique() {
        return baseRecord();
      },
    },
    verifactuRecord: {
      async findFirst() {
        return null;
      },
    },
    verifactuSoftwareConfig: {
      async findFirst() {
        return null;
      },
    },
  };

  await assert.rejects(
    buildVerifactuPayloadForFiscalRecord(client as never, fiscalRecordId),
    /requires a default VerifactuSoftwareConfig/,
  );
});
