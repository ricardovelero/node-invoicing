import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVerifactuXml,
  logVerifactuXmlPreviewForFiscalRecord,
  validateVerifactuXmlWithXsd,
  verifactuSuministroInformacionNamespace,
  verifactuSuministroLRNamespace,
} from './verifactu-xml';
import type {
  BuildVerifactuPayloadOptions,
  InvoiceFiscalRecordWithInvoiceSnapshot,
  VerifactuAltaPayload,
  VerifactuAnulacionPayload,
} from './verifactu-payload';
import { buildVerifactuPayload } from './verifactu-payload';

const previousHuella = 'A'.repeat(64);
const currentHuella = 'B'.repeat(64);
const cancellationHuella = 'C'.repeat(64);

const software = {
  producerName: 'Asienta Software SL',
  producerTaxId: 'B87654321',
  name: 'Asienta',
  id: 'AS',
  version: '1.0.0',
  installationNumber: 'inst-001',
  onlyVerifactu: 'S' as const,
  multiTaxpayerUse: 'N' as const,
  multipleTaxpayers: 'N' as const,
};

const softwareConfig = {
  producerName: software.producerName,
  producerTaxId: software.producerTaxId,
  softwareName: software.name,
  softwareId: software.id,
  softwareVersion: software.version,
  installationNumber: software.installationNumber,
  onlyVerifactu: software.onlyVerifactu,
  multiTaxpayerUse: software.multiTaxpayerUse,
  multipleTaxpayers: software.multipleTaxpayers,
};

const taxBreakdown = [
  {
    taxType: '01',
    taxRegimeKey: '01',
    operationClassification: 'S1',
    exemptOperation: null,
    taxRate: '21.00',
    taxableBaseAmount: '100.00',
    taxAmount: '21.00',
    equivalenceSurchargeRate: null,
    equivalenceSurchargeAmount: null,
  },
];

const baseAltaPayload = (): VerifactuAltaPayload => ({
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
  software,
  previousRecord: null,
  generationDateTimeWithTimezone: '2026-05-27T10:15:30+02:00',
  huellaType: '01',
  huella: currentHuella,
  customer: {
    name: 'Customer SA',
    nif: 'A87654321',
  },
  customerCountry: 'Spain',
  currency: 'EUR',
  invoiceType: 'F1',
  operationDescription: 'Servicios profesionales',
  taxBreakdown,
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

const baseAnulacionPayload = (): VerifactuAnulacionPayload => ({
  payloadVersion: '1.0',
  recordType: 'ANULACION',
  fiscalRecordId: 'f05c3f4b-b22a-487b-a453-fc29bd39a4e7',
  organizationId: '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab',
  invoiceId: '5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c',
  invoiceNumber: 'INV-2026-0001',
  issueDate: '2026-05-27T00:00:00.000Z',
  cancellationSequenceNumber: 2,
  sellerTaxId: 'B12345678',
  sellerLegalName: 'Seller Legal SL',
  sellerCountry: 'Spain',
  software,
  previousRecord: {
    sellerTaxId: 'B12345678',
    invoiceNumber: 'INV-2026-0001',
    issueDate: '2026-05-27T00:00:00.000Z',
    huella: previousHuella,
  },
  generationDateTimeWithTimezone: '2026-05-27T10:16:30+02:00',
  huellaType: '01',
  huella: cancellationHuella,
  internalHash: 'internal-cancellation-not-official',
  internalPreviousHash: 'internal-alta-not-official',
});

const payloadOptions = (): BuildVerifactuPayloadOptions => ({
  generationDateTimeWithTimezone: '2026-05-27T10:15:30+02:00',
  previousRecord: null,
  softwareConfig,
});

const fiscalRecord = (): InvoiceFiscalRecordWithInvoiceSnapshot => ({
  id: baseAltaPayload().fiscalRecordId,
  organizationId: baseAltaPayload().organizationId,
  invoiceId: baseAltaPayload().invoiceId,
  type: 'ALTA',
  sequenceNumber: 1,
  previousHash: null,
  hash: baseAltaPayload().internalHash,
  invoiceType: 'F1',
  operationDescription: 'Servicios profesionales',
  taxBreakdown,
  verifactuRecord: null,
  invoice: {
    id: baseAltaPayload().invoiceId,
    organizationId: baseAltaPayload().organizationId,
    number: baseAltaPayload().invoiceNumber,
    issueDate: new Date(baseAltaPayload().issueDate),
    currency: 'EUR',
    snapshot: {
      sellerName: 'Seller Legal SL',
      sellerLegalName: 'Seller Legal SL',
      sellerTaxId: 'B12345678',
      sellerCountry: 'Spain',
      customerName: 'Customer SA',
      customerTaxId: 'A87654321',
      customerCountry: 'Spain',
      subtotalCents: 10000,
      discountCents: 0,
      taxCents: 2100,
      withholdingType: null,
      withholdingRate: null,
      withholdingAmountCents: null,
      totalCents: 12100,
    },
  },
});

const indexOrder = (xml: string, elementNames: string[]) =>
  elementNames.map((name) => xml.indexOf(`<${name}>`));

test('buildVerifactuXml builds ALTA XML with expected fiscal values', () => {
  const xml = buildVerifactuXml(baseAltaPayload());

  assert.match(xml, /<sf:RegistroAlta>/);
  assert.match(xml, /<sf:NIF>B12345678<\/sf:NIF>/);
  assert.match(xml, /<sf:NumSerieFactura>INV-2026-0001<\/sf:NumSerieFactura>/);
  assert.match(xml, /<sf:FechaExpedicionFactura>27-05-2026<\/sf:FechaExpedicionFactura>/);
  assert.match(xml, /<sf:TipoFactura>F1<\/sf:TipoFactura>/);
  assert.match(xml, /<sf:BaseImponibleOimporteNoSujeto>100.00<\/sf:BaseImponibleOimporteNoSujeto>/);
  assert.match(xml, /<sf:TipoImpositivo>21.00<\/sf:TipoImpositivo>/);
  assert.match(xml, /<sf:CuotaTotal>21.00<\/sf:CuotaTotal>/);
  assert.match(xml, /<sf:ImporteTotal>121.00<\/sf:ImporteTotal>/);
  assert.match(xml, new RegExp(`<sf:Huella>${currentHuella}<\\/sf:Huella>`));
  assert.doesNotMatch(xml, /internal-not-official/);
});

test('buildVerifactuXml builds ANULACION XML with expected fiscal values', () => {
  const xml = buildVerifactuXml(baseAnulacionPayload());

  assert.match(xml, /<sf:RegistroAnulacion>/);
  assert.match(xml, /<sf:NIF>B12345678<\/sf:NIF>/);
  assert.match(xml, /<sf:NumSerieFacturaAnulada>INV-2026-0001<\/sf:NumSerieFacturaAnulada>/);
  assert.match(
    xml,
    /<sf:FechaExpedicionFacturaAnulada>27-05-2026<\/sf:FechaExpedicionFacturaAnulada>/,
  );
  assert.match(xml, new RegExp(`<sf:Huella>${cancellationHuella}<\\/sf:Huella>`));
  assert.doesNotMatch(xml, /internal-cancellation-not-official/);
});

test('buildVerifactuXml escapes XML special characters', () => {
  const xml = buildVerifactuXml({
    ...baseAltaPayload(),
    sellerLegalName: 'Seller & Sons <SL> "A"',
    customer: {
      name: "Customer's > Name",
      nif: 'A87654321',
    },
  });

  assert.match(xml, /Seller &amp; Sons &lt;SL&gt; &quot;A&quot;/);
  assert.match(xml, /Customer&apos;s &gt; Name/);
});

test('buildVerifactuXml uses official AEAT namespaces from local WSDL and XSD', () => {
  const xml = buildVerifactuXml(baseAltaPayload());

  assert.match(xml, new RegExp(`xmlns:sfLR="${verifactuSuministroLRNamespace}"`));
  assert.match(
    xml,
    new RegExp(`xmlns:sf="${verifactuSuministroInformacionNamespace}"`),
  );
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<sfLR:RegFactuSistemaFacturacion/);
});

test('buildVerifactuXml follows required ALTA element order', () => {
  const xml = buildVerifactuXml(baseAltaPayload());
  const order = indexOrder(xml, [
    'sf:IDVersion',
    'sf:IDFactura',
    'sf:NombreRazonEmisor',
    'sf:TipoFactura',
    'sf:DescripcionOperacion',
    'sf:Destinatarios',
    'sf:Desglose',
    'sf:CuotaTotal',
    'sf:ImporteTotal',
    'sf:Encadenamiento',
    'sf:SistemaInformatico',
    'sf:FechaHoraHusoGenRegistro',
    'sf:TipoHuella',
    'sf:Huella',
  ]);

  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.equal(order.includes(-1), false);
});

test('buildVerifactuXml follows required ANULACION element order', () => {
  const xml = buildVerifactuXml(baseAnulacionPayload());
  const order = [
    xml.indexOf('<sf:IDVersion>'),
    xml.indexOf('<sf:IDFactura>'),
    xml.indexOf('<sf:Encadenamiento>'),
    xml.indexOf('<sf:SistemaInformatico>'),
    xml.indexOf('<sf:FechaHoraHusoGenRegistro>'),
    xml.indexOf('<sf:TipoHuella>'),
    xml.lastIndexOf('<sf:Huella>'),
  ];

  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.equal(order.includes(-1), false);
});

test('validateVerifactuXmlWithXsd validates generated XML against local XSD', async () => {
  const result = await validateVerifactuXmlWithXsd(buildVerifactuXml(baseAltaPayload()));

  assert.deepEqual(result, { ok: true });
});

test('validateVerifactuXmlWithXsd rejects schema-invalid XML', async () => {
  const result = await validateVerifactuXmlWithXsd(
    buildVerifactuXml(baseAltaPayload()).replace('<sf:IDVersion>1.0</sf:IDVersion>', ''),
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /IDVersion/);
  assert.match(result.error, /IDFactura/);
});

test('logVerifactuXmlPreviewForFiscalRecord skips non-Spanish organizations', async () => {
  let findUniqueCalls = 0;
  let logCalls = 0;
  const client = {
    invoiceFiscalRecord: {
      async findUnique() {
        findUniqueCalls += 1;
        return null;
      },
    },
    verifactuRecord: {
      async findFirst() {
        throw new Error('Unexpected previous record lookup');
      },
    },
  };

  await logVerifactuXmlPreviewForFiscalRecord({
    client: client as never,
    fiscalRecordId: 'record_1',
    organizationCountryCode: 'GB',
    logger: {
      log() {
        logCalls += 1;
      },
      error() {
        throw new Error('Unexpected error log');
      },
    },
  });

  assert.equal(findUniqueCalls, 0);
  assert.equal(logCalls, 0);
});

test('logVerifactuXmlPreviewForFiscalRecord logs XML without persistence or network calls', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let logMessage = '';
  let updateCalls = 0;
  let createCalls = 0;
  const client = {
    invoiceFiscalRecord: {
      async findUnique() {
        return fiscalRecord();
      },
      async update() {
        updateCalls += 1;
      },
      async create() {
        createCalls += 1;
      },
    },
    verifactuRecord: {
      async findFirst() {
        return null;
      },
    },
    verifactuSoftwareConfig: {
      async findFirst() {
        return {
          producerName: software.producerName,
          producerTaxId: software.producerTaxId,
          softwareName: software.name,
          softwareId: software.id,
          softwareVersion: software.version,
          installationNumber: software.installationNumber,
          onlyVerifactu: software.onlyVerifactu,
          multiTaxpayerUse: software.multiTaxpayerUse,
          multipleTaxpayers: software.multipleTaxpayers,
        };
      },
    },
  };
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('Unexpected network call');
  }) as typeof fetch;

  try {
    await logVerifactuXmlPreviewForFiscalRecord({
      client: client as never,
      fiscalRecordId: fiscalRecord().id,
      organizationCountryCode: 'ES',
      logger: {
        log(prefix: string, xml: string) {
          logMessage = `${prefix} ${xml}`;
        },
        error() {
          throw new Error('Unexpected error log');
        },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(logMessage, /^\[VERIFACTU_XML_PREVIEW\] <\?xml/);
  assert.doesNotThrow(() => buildVerifactuPayload(fiscalRecord(), payloadOptions()));
  assert.equal(updateCalls, 0);
  assert.equal(createCalls, 0);
  assert.equal(fetchCalls, 0);
});
