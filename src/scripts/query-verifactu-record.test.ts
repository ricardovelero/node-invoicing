import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queryVerifactuRecordInAeatTest } from './query-verifactu-record';

test('queryVerifactuRecordInAeatTest rejects production records', async () => {
  const client = {
    verifactuRecord: {
      async findUnique() {
        return {
          id: 'verifactu_record_1',
          aeatEnvironment: 'PRODUCTION' as const,
          sellerTaxId: 'B12345674',
          invoiceNumber: 'INV-1',
          issueDate: new Date('2026-05-27T00:00:00.000Z'),
          invoice: { snapshot: { sellerName: 'Seller', sellerLegalName: 'Seller SL' } },
        };
      },
      async update() {
        throw new Error('A production record must not be updated.');
      },
    },
  };

  await assert.rejects(
    queryVerifactuRecordInAeatTest({ recordId: 'verifactu_record_1', client: client as never }),
    /generated for AEAT production/,
  );
});
