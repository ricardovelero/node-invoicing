import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  buildVerifactuHuellaSource,
  calculateVerifactuHuella,
  verifactuHuellaSourceStatus,
} from './verifactu-huella';

const previousHuella = 'A'.repeat(64);

test('verifactu Huella source is marked against the official AEAT document', () => {
  assert.equal(
    verifactuHuellaSourceStatus,
    'official-aeat-huella-specification-v0.1.2',
  );
});

test('buildVerifactuHuellaSource builds the official ALTA hash source order', () => {
  const source = buildVerifactuHuellaSource({
    recordType: 'ALTA',
    sellerTaxId: 'B12345678',
    invoiceNumber: 'INV-2026-0001',
    issueDate: '2026-05-27T00:00:00.000Z',
    invoiceType: 'F1',
    taxAmount: '21.00',
    totalAmount: '121.00',
    previousRecord: { huella: previousHuella },
    generationDateTimeWithTimezone: '2026-05-27T10:15:30+02:00',
  });

  assert.equal(
    source,
    'IDEmisorFactura=B12345678&NumSerieFactura=INV-2026-0001&' +
      'FechaExpedicionFactura=27-05-2026&TipoFactura=F1&CuotaTotal=21.00&' +
      `ImporteTotal=121.00&Huella=${previousHuella}&` +
      'FechaHoraHusoGenRegistro=2026-05-27T10:15:30+02:00',
  );
});

test('buildVerifactuHuellaSource builds the official ANULACION hash source order', () => {
  const source = buildVerifactuHuellaSource({
    recordType: 'ANULACION',
    sellerTaxId: 'B12345678',
    invoiceNumber: 'INV-2026-0001',
    issueDate: '2026-05-27T00:00:00.000Z',
    previousRecord: { huella: previousHuella },
    generationDateTimeWithTimezone: '2026-05-27T10:16:30+02:00',
  });

  assert.equal(
    source,
    'IDEmisorFacturaAnulada=B12345678&NumSerieFacturaAnulada=INV-2026-0001&' +
      `FechaExpedicionFacturaAnulada=27-05-2026&Huella=${previousHuella}&` +
      'FechaHoraHusoGenRegistro=2026-05-27T10:16:30+02:00',
  );
});

test('calculateVerifactuHuella calculates uppercase SHA-256 independently of internalHash', () => {
  const payload = {
    recordType: 'ALTA' as const,
    sellerTaxId: 'B12345678',
    invoiceNumber: 'INV-2026-0001',
    issueDate: '2026-05-27T00:00:00.000Z',
    invoiceType: 'F1',
    taxAmount: '21.00',
    totalAmount: '121.00',
    previousRecord: null,
    generationDateTimeWithTimezone: '2026-05-27T10:15:30+02:00',
  };
  const expected = createHash('sha256')
    .update(buildVerifactuHuellaSource(payload), 'utf8')
    .digest('hex')
    .toUpperCase();

  assert.equal(calculateVerifactuHuella(payload), expected);
  assert.match(calculateVerifactuHuella(payload), /^[A-F0-9]{64}$/);
  assert.notEqual(calculateVerifactuHuella(payload), 'internal-hash');
});

test('calculateVerifactuHuella matches AEAT example 6.1 first ALTA record', () => {
  const payload = {
    recordType: 'ALTA' as const,
    sellerTaxId: '89890001K',
    invoiceNumber: '12345678/G33',
    issueDate: '2024-01-01T00:00:00.000Z',
    invoiceType: 'F1',
    taxAmount: '12.35',
    totalAmount: '123.45',
    previousRecord: null,
    generationDateTimeWithTimezone: '2024-01-01T19:20:30+01:00',
  };

  assert.equal(
    buildVerifactuHuellaSource(payload),
    'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&' +
      'FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&' +
      'ImporteTotal=123.45&Huella=&' +
      'FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00',
  );
  assert.equal(
    calculateVerifactuHuella(payload),
    '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60',
  );
});

test('calculateVerifactuHuella matches AEAT example 6.2 chained ALTA record', () => {
  const payload = {
    recordType: 'ALTA' as const,
    sellerTaxId: '89890001K',
    invoiceNumber: '12345679/G34',
    issueDate: '2024-01-01T00:00:00.000Z',
    invoiceType: 'F1',
    taxAmount: '12.35',
    totalAmount: '123.45',
    previousRecord: {
      huella: '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60',
    },
    generationDateTimeWithTimezone: '2024-01-01T19:20:35+01:00',
  };

  assert.equal(
    calculateVerifactuHuella(payload),
    'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
  );
});

test('calculateVerifactuHuella matches AEAT example 6.3 ANULACION record', () => {
  const payload = {
    recordType: 'ANULACION' as const,
    sellerTaxId: '89890001K',
    invoiceNumber: '12345679/G34',
    issueDate: '2024-01-01T00:00:00.000Z',
    previousRecord: {
      huella: 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
    },
    generationDateTimeWithTimezone: '2024-01-01T19:20:40+01:00',
  };

  assert.equal(
    calculateVerifactuHuella(payload),
    '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68',
  );
});
