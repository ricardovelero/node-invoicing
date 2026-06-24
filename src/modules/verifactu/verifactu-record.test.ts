import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVerifactuRecordData,
  persistVerifactuSoapSubmissionResponse,
} from './verifactu-record';
import type { VerifactuAltaPayload } from './verifactu-payload';

const huella = 'B'.repeat(64);
const previousHuella = 'A'.repeat(64);
const responseXml = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
  'xmlns:sfR="urn:respuesta" xmlns:sf="urn:suministro"><soapenv:Body>' +
  '<sfR:RespuestaRegFactuSistemaFacturacion>' +
  '<sfR:CSV>CSV123</sfR:CSV>' +
  '<sfR:DatosPresentacion>' +
  '<sf:NIFPresentador>B12345678</sf:NIFPresentador>' +
  '<sf:TimestampPresentacion>2026-05-27T10:16:30+02:00</sf:TimestampPresentacion>' +
  '</sfR:DatosPresentacion>' +
  '<sfR:TiempoEsperaEnvio>60</sfR:TiempoEsperaEnvio>' +
  '<sfR:EstadoEnvio>ParcialmenteCorrecto</sfR:EstadoEnvio>' +
  '<sfR:RespuestaLinea>' +
  '<sfR:IDFactura><sf:IDEmisorFactura>B12345678</sf:IDEmisorFactura>' +
  '<sf:NumSerieFactura>INV-2026-0001</sf:NumSerieFactura>' +
  '<sf:FechaExpedicionFactura>27-05-2026</sf:FechaExpedicionFactura></sfR:IDFactura>' +
  '<sfR:EstadoRegistro>AceptadoConErrores</sfR:EstadoRegistro>' +
  '<sfR:CodigoErrorRegistro>4100</sfR:CodigoErrorRegistro>' +
  '<sfR:DescripcionErrorRegistro>Accepted with warning</sfR:DescripcionErrorRegistro>' +
  '</sfR:RespuestaLinea>' +
  '</sfR:RespuestaRegFactuSistemaFacturacion>' +
  '</soapenv:Body></soapenv:Envelope>';

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

test('persistVerifactuSoapSubmissionResponse stores parsed AEAT response fields', async () => {
  let updateArgs: unknown;
  const client = {
    verifactuRecord: {
      async findUnique() {
        return {
          status: 'SUBMITTED' as const,
          aeatEstadoEnvio: null,
          aeatEstadoRegistro: null,
          aeatCodigoErrorRegistro: null,
          aeatDescripcionErrorRegistro: null,
        };
      },
      async update(args: unknown) {
        updateArgs = args;

        return {
          id: 'verifactu_record_1',
          status: 'ACCEPTED_WITH_ERRORS' as const,
          aeatEstadoEnvio: 'ParcialmenteCorrecto',
          aeatEstadoRegistro: 'AceptadoConErrores',
          aeatCodigoErrorRegistro: '4100',
          aeatDescripcionErrorRegistro: 'Accepted with warning',
        };
      },
    },
  };

  const result = await persistVerifactuSoapSubmissionResponse({
    client,
    verifactuRecordId: 'verifactu_record_1',
    responseXml,
  });
  const data = (updateArgs as { data: Record<string, unknown> }).data;

  assert.equal(result.skipped, false);
  assert.equal(result.record.status, 'ACCEPTED_WITH_ERRORS');
  assert.equal(data.status, 'ACCEPTED_WITH_ERRORS');
  assert.equal(data.aeatSubmissionResponseXml, responseXml);
  assert.equal(data.aeatEstadoEnvio, 'ParcialmenteCorrecto');
  assert.equal(data.aeatEstadoRegistro, 'AceptadoConErrores');
  assert.equal(data.aeatCodigoErrorRegistro, '4100');
  assert.equal(data.aeatDescripcionErrorRegistro, 'Accepted with warning');
  assert.equal((data.aeatSubmissionResult as { kind: string }).kind, 'response');
});

test('persistVerifactuSoapSubmissionResponse does not overwrite accepted records', async () => {
  let updateCalls = 0;
  const client = {
    verifactuRecord: {
      async findUnique() {
        return {
          status: 'ACCEPTED' as const,
          aeatEstadoEnvio: 'Correcto',
          aeatEstadoRegistro: 'Correcto',
          aeatCodigoErrorRegistro: null,
          aeatDescripcionErrorRegistro: null,
        };
      },
      async update() {
        updateCalls += 1;
        throw new Error('update should not be called');
      },
    },
  };

  const result = await persistVerifactuSoapSubmissionResponse({
    client,
    verifactuRecordId: 'verifactu_record_1',
    responseXml,
  });

  assert.equal(result.skipped, true);
  assert.equal(result.record.status, 'ACCEPTED');
  assert.equal(result.record.aeatEstadoEnvio, 'Correcto');
  assert.equal(updateCalls, 0);
});
