import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVerifactuQr,
  buildVerifactuQrUrl,
  verifactuQrBaseUrl,
} from './verifactu-qr';

const recordXml = (importeTotal: string) =>
  '<sfLR:RegFactuSistemaFacturacion><sfLR:RegistroFactura><sf:RegistroAlta>' +
  `<sf:CuotaTotal>21.00</sf:CuotaTotal><sf:ImporteTotal>${importeTotal}</sf:ImporteTotal>` +
  '</sf:RegistroAlta></sfLR:RegistroFactura></sfLR:RegFactuSistemaFacturacion>';

const record = (overrides: Partial<Parameters<typeof buildVerifactuQrUrl>[0]> = {}) => ({
  sellerTaxId: '89890001K',
  invoiceNumber: '12345678&G33',
  issueDate: new Date('2024-01-01T00:00:00.000Z'),
  xml: recordXml('241.4'),
  ...overrides,
});

test('verifactuQrBaseUrl uses preproduction unless production is configured', () => {
  assert.equal(verifactuQrBaseUrl({}), 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR');
  assert.equal(
    verifactuQrBaseUrl({ VERIFACTU_AEAT_ENV: 'test' }),
    'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
  );
  assert.equal(
    verifactuQrBaseUrl({ VERIFACTU_AEAT_ENV: 'production' }),
    'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
  );
});

test('buildVerifactuQrUrl matches the AEAT URL encoding example', () => {
  // DetalleEspecificacTecnCodigoQRfactura v0.5.0, section 4.
  assert.equal(
    buildVerifactuQrUrl(record(), {}),
    'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K' +
      '&numserie=12345678%26G33&fecha=01-01-2024&importe=241.4',
  );
});

test('buildVerifactuQrUrl uses the ImporteTotal registered in the record XML', () => {
  const url = new URL(buildVerifactuQrUrl(record({
    invoiceNumber: 'INV-2026-0033',
    issueDate: new Date('2026-06-24T00:00:00.000Z'),
    xml: recordXml('114.95'),
  }), {}));

  assert.equal(url.searchParams.get('numserie'), 'INV-2026-0033');
  assert.equal(url.searchParams.get('fecha'), '24-06-2026');
  assert.equal(url.searchParams.get('importe'), '114.95');
  assert.equal(url.searchParams.has('formato'), false);
});

test('buildVerifactuQrUrl rejects record XML without ImporteTotal', () => {
  assert.throws(
    () => buildVerifactuQrUrl(record({ xml: '<sf:RegistroAnulacion />' }), {}),
    /ImporteTotal/,
  );
});

test('buildVerifactuQr returns null without a registered record', async () => {
  assert.equal(await buildVerifactuQr(undefined, {}), null);
});

test('buildVerifactuQr renders the URL as an SVG QR code', async () => {
  const qr = await buildVerifactuQr(record(), {});

  assert.ok(qr);
  assert.equal(qr.url, buildVerifactuQrUrl(record(), {}));
  assert.match(qr.svg, /^<svg[^>]*viewBox="0 0 \d+ \d+"/);
  assert.doesNotMatch(qr.svg, /<script/);
});
