import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  buildVerifactuPayload,
  type BuildVerifactuPayloadOptions,
  type InvoiceFiscalRecordWithInvoiceSnapshot,
} from './verifactu-payload';

const organizationId = '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab';
const invoiceId = '5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c';
const fiscalRecordId = 'e4cd5d64-124f-4635-9548-2ca1df11fa52';
const previousHuella = 'A'.repeat(64);

export const baseVerifactuOptions = (): BuildVerifactuPayloadOptions => ({
  generationDateTimeWithTimezone: '2026-05-27T10:15:30+02:00',
  software: {
    producerName: 'Asienta Software SL',
    producerTaxId: 'B87654321',
    name: 'Asienta',
    id: 'AS',
    version: '1.0.0',
    installationNumber: 'inst-001',
    onlyVerifactu: 'S',
    multiTaxpayerUse: 'N',
    multipleTaxpayers: 'N',
  },
  previousRecord: {
    sellerTaxId: 'B12345678',
    invoiceNumber: 'INV-2026-0000',
    issueDate: '2026-05-26T00:00:00.000Z',
    huella: previousHuella,
  },
  alta: {
    invoiceType: 'F1',
    operationDescription: 'Servicios profesionales',
    taxBreakdown: [
      {
        taxType: '01',
        taxRegimeKey: '01',
        operationClassification: 'S1',
        exemptOperation: null,
        taxRate: '21.00',
        taxableBaseAmount: '95.00',
        taxAmount: '19.95',
        equivalenceSurchargeRate: null,
        equivalenceSurchargeAmount: null,
      },
    ],
  },
});

const baseRecord = (): InvoiceFiscalRecordWithInvoiceSnapshot => ({
  id: fiscalRecordId,
  organizationId,
  invoiceId,
  type: 'ALTA',
  sequenceNumber: 7,
  previousHash: 'previous-internal-hash',
  hash: 'current-internal-hash',
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
  assert.equal(payload.invoiceType, 'F1');
  assert.equal(payload.operationDescription, 'Servicios profesionales');
  assert.equal(payload.taxAmount, '19.95');
  assert.equal(payload.totalAmount, '99.95');
  assert.equal(payload.internalFiscalSequenceNumber, 7);
  assert.equal(payload.internalPreviousHash, 'previous-internal-hash');
  assert.equal(payload.internalHash, 'current-internal-hash');
  assert.match(payload.huella, /^[A-F0-9]{64}$/);
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
  const options = baseVerifactuOptions();
  options.alta = undefined;

  assert.throws(
    () => buildVerifactuPayload(baseRecord(), options),
    /requires ALTA fiscal details/,
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
