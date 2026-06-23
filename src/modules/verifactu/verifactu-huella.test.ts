import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  buildVerifactuHuellaSource,
  calculateVerifactuHuella,
} from './verifactu-huella';

const previousHuella = 'A'.repeat(64);

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
