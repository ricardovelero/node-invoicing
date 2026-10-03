import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVerifactuRecipientId,
  resolveVerifactuCountryCode,
} from './verifactu-destinatario';

test('resolveVerifactuCountryCode matches free-text country names and codes', () => {
  for (const [value, expected] of [
    ['Spain', 'ES'],
    ['España', 'ES'],
    ['es', 'ES'],
    ['United States', 'US'],
    ['United States of America', 'US'],
    ['Estados Unidos', 'US'],
    ['United Kingdom', 'GB'],
    ['UK', 'GB'],
    ['Reino Unido', 'GB'],
    ['Deutschland', null],
    ['Germany', 'DE'],
    ['Alemania', 'DE'],
    ['Grecia', 'GR'],
    ['  ', null],
    [null, null],
  ] as const) {
    assert.equal(resolveVerifactuCountryCode(value), expected, String(value));
  }
});

test('buildVerifactuRecipientId sends Spanish customers as NIF', () => {
  assert.deepEqual(buildVerifactuRecipientId('b12345674', 'Spain'), {
    nif: 'B12345674',
    idOtro: null,
  });
  assert.deepEqual(buildVerifactuRecipientId('ESB12345674', null), {
    nif: 'B12345674',
    idOtro: null,
  });
  assert.deepEqual(buildVerifactuRecipientId('ES5671234890', ''), {
    nif: 'ES5671234890',
    idOtro: null,
  });
});

test('buildVerifactuRecipientId sends EU customers as NIF-IVA in IDOtro', () => {
  assert.deepEqual(buildVerifactuRecipientId('FR 123.456.789-01', 'France'), {
    nif: null,
    idOtro: { codigoPais: 'FR', idType: '02', id: 'FR12345678901' },
  });
  assert.deepEqual(buildVerifactuRecipientId('DE123456789', 'Germany'), {
    nif: null,
    idOtro: { codigoPais: 'DE', idType: '02', id: 'DE123456789' },
  });
  assert.deepEqual(buildVerifactuRecipientId('123456789', 'Greece'), {
    nif: null,
    idOtro: { codigoPais: 'GR', idType: '02', id: 'EL123456789' },
  });
});

test('buildVerifactuRecipientId sends other customers by their national tax ID', () => {
  assert.deepEqual(buildVerifactuRecipientId('US123456789-0', 'United States'), {
    nif: null,
    idOtro: { codigoPais: 'US', idType: '04', id: 'US123456789-0' },
  });
  assert.deepEqual(buildVerifactuRecipientId('gb123456789', 'United Kingdom'), {
    nif: null,
    idOtro: { codigoPais: 'GB', idType: '04', id: 'GB123456789' },
  });
});
