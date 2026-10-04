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

type RetryRecord = {
  type: 'ALTA' | 'ANULACION';
  verifactuRecord: { id: string; status: VerifactuRecordStatus };
};

// Records are given newest first, as the query orders them.
const retryClient = (records: RetryRecord[]) => {
  const calls: Record<string, unknown> = {};
  const client = {
    invoiceFiscalRecord: {
      async findMany(args: unknown) {
        calls.findMany = args;

        return records;
      },
    },
    verifactuRecord: {
      async updateMany(args: { where: { id: { in: string[] } } }) {
        calls.updateMany = args;

        return { count: args.where.id.in.length };
      },
    },
  };

  return { client: client as never, calls };
};

const retryRecord = (
  id: string,
  type: RetryRecord['type'],
  status: VerifactuRecordStatus,
): RetryRecord => ({ type, verifactuRecord: { id, status } });

test('retryVerifactuPreflightFailures requeues the latest record when it failed', async () => {
  const { client, calls } = retryClient([
    retryRecord('record_alta', 'ALTA', 'PREFLIGHT_FAILED'),
  ]);

  assert.equal(await retryVerifactuPreflightFailures(client, organizationId, 'inv_1'), 1);
  assert.deepEqual(calls.findMany, {
    where: {
      organizationId,
      invoiceId: 'inv_1',
      verifactuRecord: { is: { aeatEnvironment: 'TEST' } },
    },
    orderBy: { sequenceNumber: 'desc' },
    select: { type: true, verifactuRecord: { select: { id: true, status: true } } },
  });
  assert.deepEqual(calls.updateMany, {
    where: { id: { in: ['record_alta'] }, status: 'PREFLIGHT_FAILED' },
    data: { status: 'GENERATED', preflightError: null },
  });
});

test('retryVerifactuPreflightFailures requeues an ALTA failed with its ANULACION', async () => {
  // A client fault failed the request that held both records.
  const { client, calls } = retryClient([
    retryRecord('record_anulacion', 'ANULACION', 'PREFLIGHT_FAILED'),
    retryRecord('record_alta', 'ALTA', 'PREFLIGHT_FAILED'),
  ]);

  assert.equal(await retryVerifactuPreflightFailures(client, organizationId, 'inv_1'), 2);
  assert.deepEqual(
    (calls.updateMany as { where: unknown }).where,
    { id: { in: ['record_anulacion', 'record_alta'] }, status: 'PREFLIGHT_FAILED' },
  );
});

test('retryVerifactuPreflightFailures stops at the current ALTA', async () => {
  // Both the original ALTA and its subsanación failed; only the subsanación is current.
  const { client, calls } = retryClient([
    retryRecord('record_subsanacion', 'ALTA', 'PREFLIGHT_FAILED'),
    retryRecord('record_original', 'ALTA', 'PREFLIGHT_FAILED'),
  ]);

  assert.equal(await retryVerifactuPreflightFailures(client, organizationId, 'inv_1'), 1);
  assert.deepEqual(
    (calls.updateMany as { where: unknown }).where,
    { id: { in: ['record_subsanacion'] }, status: 'PREFLIGHT_FAILED' },
  );
});

test('retryVerifactuPreflightFailures leaves failures superseded by a later record', async () => {
  // The original ALTA failed pre-flight, then an accepted subsanación replaced it.
  const { client, calls } = retryClient([
    retryRecord('record_subsanacion', 'ALTA', 'ACCEPTED'),
    retryRecord('record_original', 'ALTA', 'PREFLIGHT_FAILED'),
  ]);

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
