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
          aeatEnvironment: 'TEST' as const,
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

test('submitVerifactuRecordToAeatTest rejects production records', async () => {
  const client = {
    verifactuRecord: {
      async findUnique() {
        return {
          id: 'verifactu_record_1',
          xml: '<not-validated />',
          status: 'GENERATED' as const,
          aeatEnvironment: 'PRODUCTION' as const,
        };
      },
      async update() {
        throw new Error('A production record must not be updated.');
      },
    },
  };

  await assert.rejects(
    submitVerifactuRecordToAeatTest({ recordId: 'verifactu_record_1', client: client as never }),
    /generated for AEAT production/,
  );
});
