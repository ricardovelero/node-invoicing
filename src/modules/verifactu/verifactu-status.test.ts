import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VerifactuRecordStatus } from '@prisma/client';
import {
  getVerifactuIssues,
  retryVerifactuPreflightFailures,
  verifactuCsvFromResult,
} from './verifactu-status';

const organizationId = '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab';

const fiscalRecord = (
  invoiceId: string,
  status: VerifactuRecordStatus,
  type: 'ALTA' | 'ANULACION' = 'ALTA',
) => ({
  invoiceId,
  type,
  subsanacionNumber: 0,
  invoice: { number: invoiceId.toUpperCase(), issueDate: new Date('2026-10-01') },
  verifactuRecord: { id: `${invoiceId}_${status}`, status },
});

test('getVerifactuIssues lists invoices whose latest record needs attention', async () => {
  const calls: Record<string, unknown>[] = [];
  const client = {
    verifactuRecord: {
      async findMany(args: Record<string, unknown>) {
        calls.push(args);

        return [{ invoiceId: 'inv_rejected' }, { invoiceId: 'inv_fixed' }];
      },
    },
    invoiceFiscalRecord: {
      async findMany(args: Record<string, unknown>) {
        calls.push(args);

        // Newest first: inv_fixed was corrected by a later, accepted subsanación.
        return [
          fiscalRecord('inv_fixed', 'ACCEPTED'),
          fiscalRecord('inv_rejected', 'REJECTED'),
          fiscalRecord('inv_fixed', 'REJECTED'),
        ];
      },
    },
  };

  const issues = await getVerifactuIssues(client as never, organizationId);

  assert.deepEqual(issues.map((issue) => issue.invoiceId), ['inv_rejected']);
  assert.deepEqual((calls[0] as { where: unknown }).where, {
    organizationId,
    aeatEnvironment: 'TEST',
    status: { in: ['ACCEPTED_WITH_ERRORS', 'REJECTED', 'PREFLIGHT_FAILED'] },
  });
  assert.deepEqual((calls[1] as { where: unknown }).where, {
    organizationId,
    invoiceId: { in: ['inv_rejected', 'inv_fixed'] },
    verifactuRecord: { is: { aeatEnvironment: 'TEST' } },
  });
});

test('getVerifactuIssues skips the history query without failed records', async () => {
  const client = {
    verifactuRecord: {
      async findMany() {
        return [];
      },
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
