import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVerifactuRecordData } from './verifactu-record';
import type { VerifactuAltaPayload } from './verifactu-payload';

const huella = 'B'.repeat(64);
const previousHuella = 'A'.repeat(64);

const payload = (): VerifactuAltaPayload => ({
  payloadVersion: '1.0',
  recordType: 'ALTA',
  fiscalRecordId: 'e4cd5d64-124f-4635-9548-2ca1df11fa52',
  organizationId: '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab',
  invoiceId: '5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c',
  invoiceNumber: 'INV-2026-0001',
  issueDate: '2026-05-27T00:00:00.000Z',
  sellerTaxId: 'B12345678',
  sellerLegalName: 'Seller Legal SL',
  sellerCountry: 'Spain',
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
  generationDateTimeWithTimezone: '2026-05-27T10:15:30+02:00',
  huellaType: '01',
  huella,
  customer: { name: 'Customer SA', nif: 'A87654321' },
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

test('buildVerifactuRecordData maps payload and XML to persistent record data', () => {
  const data = buildVerifactuRecordData({
    payload: payload(),
    xml: '<xml />',
    previousVerifactuRecordId: '7d099fc2-225e-4f00-b35a-b1fdc1b62d4e',
  });

  assert.equal(data.invoiceFiscalRecordId, payload().fiscalRecordId);
  assert.equal(data.invoiceId, payload().invoiceId);
  assert.equal(data.organizationId, payload().organizationId);
  assert.equal(data.recordType, 'ALTA');
  assert.equal(data.sellerTaxId, 'B12345678');
  assert.equal(data.invoiceNumber, 'INV-2026-0001');
  assert.equal(data.previousSellerTaxId, 'B12345678');
  assert.equal(data.previousInvoiceNumber, 'INV-2026-0000');
  assert.equal(data.previousHuella, previousHuella);
  assert.equal(data.huella, huella);
  assert.equal(data.generationDateTimeWithTimezone, '2026-05-27T10:15:30+02:00');
  assert.equal(data.payloadVersion, '1.0');
  assert.equal(data.xml, '<xml />');
  assert.equal(data.status, 'GENERATED');
});
