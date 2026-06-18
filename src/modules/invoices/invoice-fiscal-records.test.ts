import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Prisma } from '@prisma/client';
import {
  createInvoiceFiscalRecord,
  nextInvoiceFiscalRecordSequenceNumber,
} from './invoice-fiscal-records';

const createTransactionMock = (
  reservedValue: bigint | number,
  capture?: (strings: TemplateStringsArray, values: unknown[]) => void,
) =>
  ({
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      capture?.(strings, values);
      return [{ reservedValue }];
    },
    invoiceFiscalRecord: {
      create: async (args: unknown) => args,
    },
  }) as unknown as Prisma.TransactionClient;

test('nextInvoiceFiscalRecordSequenceNumber reserves the first sequence value', async () => {
  const tx = createTransactionMock(1);

  const number = await nextInvoiceFiscalRecordSequenceNumber(
    tx,
    '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab',
  );

  assert.equal(number, 1);
});

test('nextInvoiceFiscalRecordSequenceNumber formats bigint sequence values', async () => {
  const tx = createTransactionMock(42n);

  const number = await nextInvoiceFiscalRecordSequenceNumber(
    tx,
    '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab',
  );

  assert.equal(number, 42);
});

test('nextInvoiceFiscalRecordSequenceNumber uses an organization-scoped upsert', async () => {
  const organizationId = '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab';
  let query = '';
  let queryValues: unknown[] = [];
  const tx = createTransactionMock(1, (strings, values) => {
    query = strings.join('?');
    queryValues = values;
  });

  await nextInvoiceFiscalRecordSequenceNumber(tx, organizationId);

  assert.match(query, /INSERT INTO "InvoiceFiscalRecordSequence"/);
  assert.match(query, /ON CONFLICT \("organizationId"\)/);
  assert.match(query, /RETURNING "nextValue" - 1 AS "reservedValue"/);
  assert.deepEqual(queryValues, [organizationId]);
});

test('createInvoiceFiscalRecord stores sequence and acting user attribution', async () => {
  const tx = createTransactionMock(7);

  const result = await createInvoiceFiscalRecord(tx, {
    invoiceId: '5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c',
    organizationId: '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab',
    type: 'ANULACION',
    createdByUserId: 'user_1',
  });

  assert.deepEqual(result, {
    data: {
      invoiceId: '5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c',
      organizationId: '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab',
      type: 'ANULACION',
      sequenceNumber: 7,
      createdByUserId: 'user_1',
    },
  });
});
