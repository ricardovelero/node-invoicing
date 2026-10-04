import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidSpanishNif } from './verifactu-nif';

test('isValidSpanishNif accepts valid DNI, NIE, K/L/M and entity NIFs', () => {
  for (const nif of [
    '12345678Z',
    '00000000T',
    'X1234567L',
    'Y1234567X',
    'Z1234567R',
    'K1234567L',
    'M12AB567C',
    'L1234X67Q',
    'B12345674',
    'A87654323',
    'Q2826000H',
    'G1234567D',
    'G12345674',
    'b12345674',
  ]) {
    assert.equal(isValidSpanishNif(nif), true, nif);
  }
});

test('isValidSpanishNif rejects wrong control characters and formats', () => {
  for (const nif of [
    '12345678A',
    'X1234567A',
    'K1234567A',
    'M12AB5671',
    'M12-B567C',
    'B12345678',
    'B1234567D',
    'Q28260008',
    'ES56712340987',
    'ESB12345674',
    '1234567Z',
    'I1234567A',
    '',
  ]) {
    assert.equal(isValidSpanishNif(nif), false, nif);
  }
});
