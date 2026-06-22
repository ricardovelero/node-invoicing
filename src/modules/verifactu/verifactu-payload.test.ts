import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  buildVerifactuPayload,
  type InvoiceFiscalRecordWithInvoiceSnapshot,
} from './verifactu-payload';

const organizationId = '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab';
const invoiceId = '5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c';
const fiscalRecordId = 'e4cd5d64-124f-4635-9548-2ca1df11fa52';

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
      sellerTaxId: 'ESB12345678',
      sellerCountry: 'Spain',
      customerName: 'Snapshot Customer SA',
      customerTaxId: 'ESA87654321',
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
  const payload = buildVerifactuPayload(baseRecord());

  assert.deepEqual(payload, {
    recordType: 'ALTA',
    fiscalRecordId,
    organizationId,
    invoiceId,
    invoiceNumber: 'INV-2026-0001',
    issueDate: '2026-05-27T00:00:00.000Z',
    sellerTaxId: 'ESB12345678',
    sellerLegalName: 'Snapshot Legal SL',
    sellerCountry: 'Spain',
    customerName: 'Snapshot Customer SA',
    customerTaxId: 'ESA87654321',
    customerCountry: 'Spain',
    currency: 'EUR',
    subtotalCents: 10000,
    discountCents: 500,
    taxCents: 1995,
    withholdingType: 'IRPF',
    withholdingRate: '15.00',
    withholdingAmountCents: 1500,
    totalCents: 9995,
    internalFiscalSequenceNumber: 7,
    internalPreviousHash: 'previous-internal-hash',
    internalHash: 'current-internal-hash',
  });
});

test('buildVerifactuPayload builds an ANULACION payload from a fiscal record snapshot', () => {
  const payload = buildVerifactuPayload({
    ...baseRecord(),
    type: 'ANULACION',
    sequenceNumber: 8,
    previousHash: 'alta-internal-hash',
    hash: 'cancellation-internal-hash',
  });

  assert.deepEqual(payload, {
    recordType: 'ANULACION',
    fiscalRecordId,
    organizationId,
    invoiceId,
    invoiceNumber: 'INV-2026-0001',
    issueDate: '2026-05-27T00:00:00.000Z',
    cancellationSequenceNumber: 8,
    sellerTaxId: 'ESB12345678',
    sellerLegalName: 'Snapshot Legal SL',
    sellerCountry: 'Spain',
    internalHash: 'cancellation-internal-hash',
    internalPreviousHash: 'alta-internal-hash',
  });
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

  const payload = buildVerifactuPayload(record);

  assert.equal(payload.sellerTaxId, 'ESB12345678');
  assert.equal(payload.sellerLegalName, 'Snapshot Legal SL');
  assert.equal(payload.sellerCountry, 'Spain');
  assert.equal(payload.recordType, 'ALTA');
  assert.equal(payload.customerName, 'Snapshot Customer SA');
  assert.equal(payload.customerTaxId, 'ESA87654321');
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
    }),
    /requires an invoice snapshot/,
  );
});

test('buildVerifactuPayload rejects a missing seller tax ID', () => {
  const record = baseRecord();
  record.invoice.snapshot!.sellerTaxId = '  ';

  assert.throws(
    () => buildVerifactuPayload(record),
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
    }),
    /requires an invoice number/,
  );
});

test('buildVerifactuPayload exposes internal hash values with internal names only', () => {
  const payload = buildVerifactuPayload(baseRecord());
  const payloadKeys = Object.keys(payload);

  assert.equal(payload.internalHash, 'current-internal-hash');
  assert.equal(payload.internalPreviousHash, 'previous-internal-hash');
  assert.equal(payloadKeys.includes('hash'), false);
  assert.equal(payloadKeys.includes('previousHash'), false);
  assert.equal(payloadKeys.includes('officialHash'), false);
  assert.equal(payloadKeys.includes('verifactuHash'), false);
});

test('buildVerifactuPayload does not generate XML', () => {
  const payload = buildVerifactuPayload(baseRecord());
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
    buildVerifactuPayload(baseRecord());
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalls, 0);
});
