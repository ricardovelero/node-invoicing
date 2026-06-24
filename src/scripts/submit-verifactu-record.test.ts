import assert from 'node:assert/strict';
import { test } from 'node:test';
import { submitVerifactuRecordToAeatTest } from './submit-verifactu-record';

test('submitVerifactuRecordToAeatTest skips accepted records before network submission', async () => {
  const logs: unknown[][] = [];
  const client = {
    verifactuRecord: {
      async findUnique() {
        return {
          id: 'verifactu_record_1',
          xml: '<not-validated />',
          status: 'ACCEPTED' as const,
        };
      },
    },
  };

  const result = await submitVerifactuRecordToAeatTest({
    recordId: 'verifactu_record_1',
    client: client as never,
    logger: {
      log(...args: unknown[]) {
        logs.push(args);
      },
    },
  });

  assert.equal(result.skipped, true);
  assert.deepEqual(logs, [[
    '[VERIFACTU_AEAT_TEST_SKIP]',
    'VerifactuRecord already ACCEPTED: verifactu_record_1',
  ]]);
});
