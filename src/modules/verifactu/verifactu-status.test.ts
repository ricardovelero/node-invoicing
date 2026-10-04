import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VerifactuRecordStatus } from '@prisma/client';
import {
  getVerifactuIssues,
  retryVerifactuPreflightFailures,
  verifactuCsvFromResult,
} from './verifactu-status';

const organizationId = '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab';

test('getVerifactuIssues loads only the latest failing record of each invoice', async () => {
  const calls: Record<string, unknown> = {};
  const client = {
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      calls.sql = strings.join('?');
      calls.values = values;

      return [{ id: 'record_rejected' }];
    },
    invoiceFiscalRecord: {
      async findMany(args: unknown) {
        calls.findMany = args;

        return [];
      },
    },
  };

  await getVerifactuIssues(client as never, organizationId);

  // The latest record per invoice is picked in the database, among invoices
  // that ever had a failing record in the current AEAT environment.
  assert.match(calls.sql as string, /DISTINCT ON \(vr\."invoiceId"\)/);
  assert.match(calls.sql as string, /ORDER BY vr\."invoiceId", fr\."sequenceNumber" DESC/);
  assert.ok((calls.values as unknown[]).includes('TEST'));
  assert.ok((calls.values as unknown[]).includes(organizationId));
  assert.deepEqual((calls.findMany as { where: unknown }).where, {
    organizationId,
    verifactuRecord: { is: { id: { in: ['record_rejected'] } } },
  });
});

test('getVerifactuIssues skips the history query without failing records', async () => {
  const client = {
    async $queryRaw() {
      return [];
    },
    invoiceFiscalRecord: {
      async findMany() {
        throw new Error('History should not be loaded.');
      },
    },
  };

  assert.deepEqual(await getVerifactuIssues(client as never, organizationId), []);
});

const retryClient = (latestStatus: VerifactuRecordStatus) => {
  const calls: Record<string, unknown> = {};
  const client = {
    invoiceFiscalRecord: {
      async findFirst(args: unknown) {
        calls.findFirst = args;

        return { verifactuRecord: { id: 'record_latest', status: latestStatus } };
      },
    },
    verifactuRecord: {
      async updateMany(args: unknown) {
        calls.updateMany = args;

        return { count: 1 };
      },
    },
  };

  return { client: client as never, calls };
};

test('retryVerifactuPreflightFailures requeues the latest record when it failed', async () => {
  const { client, calls } = retryClient('PREFLIGHT_FAILED');

  assert.equal(await retryVerifactuPreflightFailures(client, organizationId, 'inv_1'), 1);
  assert.deepEqual(calls.findFirst, {
    where: {
      organizationId,
      invoiceId: 'inv_1',
      verifactuRecord: { is: { aeatEnvironment: 'TEST' } },
    },
    orderBy: { sequenceNumber: 'desc' },
    select: { verifactuRecord: { select: { id: true, status: true } } },
  });
  assert.deepEqual(calls.updateMany, {
    where: { id: 'record_latest', status: 'PREFLIGHT_FAILED' },
    data: { status: 'GENERATED', preflightError: null },
  });
});

test('retryVerifactuPreflightFailures leaves failures superseded by a later record', async () => {
  // The original ALTA failed pre-flight, then an accepted subsanación replaced it.
  const { client, calls } = retryClient('ACCEPTED');

  assert.equal(await retryVerifactuPreflightFailures(client, organizationId, 'inv_1'), 0);
  assert.equal(calls.updateMany, undefined);
});

test('verifactuCsvFromResult reads the CSV from the stored submission result', () => {
  assert.equal(
    verifactuCsvFromResult({ kind: 'response', csv: 'A-YDSW8NLFLANWPM' }),
    'A-YDSW8NLFLANWPM',
  );
  assert.equal(verifactuCsvFromResult({ kind: 'fault', faultCode: '100' }), null);
  assert.equal(verifactuCsvFromResult(null), null);
});
