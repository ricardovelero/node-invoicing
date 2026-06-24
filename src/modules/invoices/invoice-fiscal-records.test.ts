import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  buildFiscalRecordHashInput,
  hashFiscalRecordInput,
  createInvoiceFiscalRecord,
  invoiceFiscalRecordHashVersion,
  nextInvoiceFiscalRecordSequenceNumber,
  verifyInvoiceFiscalRecordChain,
} from './invoice-fiscal-records';

const organizationId = '5a87c29e-7f69-4ee0-b1c0-1478690fe5ab';
const otherOrganizationId = '6f90d2d6-f437-4af0-8760-9f14d9384a45';
const invoiceId = '5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c';

const invoiceForHash = {
  id: invoiceId,
  organizationId,
  number: 'INV-2026-0001',
  status: 'ISSUED',
  paymentStatus: 'UNPAID',
  issueDate: new Date('2026-05-27T00:00:00.000Z'),
  dueDate: new Date('2026-06-27T00:00:00.000Z'),
  currency: 'EUR',
  subtotalCents: 10000,
  discountCents: 0,
  taxCents: 2100,
  withholdingType: null,
  withholdingRate: null,
  withholdingAmountCents: null,
  totalCents: 12100,
  snapshot: {
    sellerName: 'Analytical Engines',
    sellerLegalName: 'Analytical Engines Ltd',
    sellerTaxId: 'VAT123',
    sellerAddressLine1: '1 Seller St',
    sellerCity: 'Madrid',
    sellerCountry: 'Spain',
    customerName: 'Ada Co',
    customerEmail: 'billing@ada.example',
    customerTaxId: 'CUST-123',
    customerAddressLine1: '1 Customer St',
    customerCity: 'London',
    customerCountry: 'GB',
    subtotalCents: 10000,
    discountCents: 0,
    taxCents: 2100,
    withholdingType: null,
    withholdingRate: null,
    withholdingAmountCents: null,
    totalCents: 12100,
  },
  lines: [{
    description: 'Consulting services',
    taxRateBps: 2100,
    taxCents: 2100,
    totalCents: 10000,
    invoiceDiscountCents: 0,
  }],
};

const baseHashInput = () =>
  buildFiscalRecordHashInput({
    recordType: 'ALTA',
    sequenceNumber: 1,
    organizationId,
    invoiceId,
    invoiceNumber: 'INV-2026-0001',
    invoiceStatus: 'ISSUED',
    issueDate: new Date('2026-05-27T00:00:00.000Z'),
    dueDate: new Date('2026-06-27T00:00:00.000Z'),
    currency: 'EUR',
    subtotalCents: 10000,
    discountCents: 0,
    taxCents: 2100,
    withholdingType: null,
    withholdingRate: null,
    withholdingAmountCents: null,
    totalCents: 12100,
    snapshot: {
      sellerName: 'Analytical Engines',
      sellerLegalName: 'Analytical Engines Ltd',
      sellerTaxId: 'VAT123',
      sellerAddressLine1: '1 Seller St',
      sellerCity: 'Madrid',
      sellerCountry: 'Spain',
      customerName: 'Ada Co',
      customerEmail: 'billing@ada.example',
      customerTaxId: 'CUST-123',
      customerAddressLine1: '1 Customer St',
      customerCity: 'London',
      customerCountry: 'GB',
    },
    previousHash: null,
  });

const createTransactionMock = ({
  reservedValue,
  invoice = invoiceForHash,
  previousRecord = null,
  captureQuery,
  capturePreviousRecordLookup,
}: {
  reservedValue: bigint | number;
  invoice?: unknown;
  previousRecord?: { id: string; hash: string } | null;
  captureQuery?: (strings: TemplateStringsArray, values: unknown[]) => void;
  capturePreviousRecordLookup?: (args: unknown) => void;
}) =>
  ({
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      captureQuery?.(strings, values);
      return [{ reservedValue }];
    },
    invoice: {
      findFirst: async () => invoice,
    },
    invoiceFiscalRecord: {
      findFirst: async (args: unknown) => {
        capturePreviousRecordLookup?.(args);
        return previousRecord;
      },
      create: async (args: unknown) => args,
    },
  }) as unknown as Prisma.TransactionClient;

test('nextInvoiceFiscalRecordSequenceNumber reserves the first sequence value', async () => {
  const tx = createTransactionMock({ reservedValue: 1 });

  const number = await nextInvoiceFiscalRecordSequenceNumber(
    tx,
    organizationId,
  );

  assert.equal(number, 1);
});

test('nextInvoiceFiscalRecordSequenceNumber formats bigint sequence values', async () => {
  const tx = createTransactionMock({ reservedValue: 42n });

  const number = await nextInvoiceFiscalRecordSequenceNumber(
    tx,
    organizationId,
  );

  assert.equal(number, 42);
});

test('nextInvoiceFiscalRecordSequenceNumber uses an organization-scoped upsert', async () => {
  let query = '';
  let queryValues: unknown[] = [];
  const tx = createTransactionMock({
    reservedValue: 1,
    captureQuery: (strings, values) => {
      query = strings.join('?');
      queryValues = values;
    },
  });

  await nextInvoiceFiscalRecordSequenceNumber(tx, organizationId);

  assert.match(query, /INSERT INTO "InvoiceFiscalRecordSequence"/);
  assert.match(query, /ON CONFLICT \("organizationId"\)/);
  assert.match(query, /RETURNING "nextValue" - 1 AS "reservedValue"/);
  assert.deepEqual(queryValues, [organizationId]);
});

test('hashFiscalRecordInput is deterministic for canonical JSON input', () => {
  const left = {
    b: 2,
    a: {
      d: 'four',
      c: 'three',
    },
  };
  const right = {
    a: {
      c: 'three',
      d: 'four',
    },
    b: 2,
  };

  assert.equal(hashFiscalRecordInput(left), hashFiscalRecordInput(right));
});

test('hashFiscalRecordInput changes when relevant input changes', () => {
  const original = baseHashInput();
  const changed = {
    ...original,
    totalCents: 12101,
  };

  assert.notEqual(
    hashFiscalRecordInput(original),
    hashFiscalRecordInput(changed),
  );
});

test('buildFiscalRecordHashInput excludes mutable payment status', () => {
  const hashInput = baseHashInput();

  assert.equal('invoicePaymentStatus' in hashInput, false);
});

const buildHashInputWithRate = (rate: Prisma.Decimal | number | string) =>
  buildFiscalRecordHashInput({
    recordType: 'ALTA',
    sequenceNumber: 1,
    organizationId,
    invoiceId,
    invoiceNumber: 'INV-2026-0001',
    invoiceStatus: 'ISSUED',
    issueDate: new Date('2026-05-27T00:00:00.000Z'),
    dueDate: new Date('2026-06-27T00:00:00.000Z'),
    currency: 'EUR',
    subtotalCents: 10000,
    discountCents: 0,
    taxCents: 0,
    withholdingType: 'IRPF',
    withholdingRate: rate,
    withholdingAmountCents: 1500,
    totalCents: 8500,
    snapshot: null,
    previousHash: null,
  });

test('buildFiscalRecordHashInput normalizes withholding rate to a fixed two-decimal string', () => {
  // Matches the SQL backfill, which renders Decimal(5, 2) columns via `::text`.
  assert.equal(buildHashInputWithRate(new Prisma.Decimal('15')).withholdingRate, '15.00');
  assert.equal(buildHashInputWithRate(15).withholdingRate, '15.00');
  assert.equal(buildHashInputWithRate('15').withholdingRate, '15.00');
  assert.equal(buildHashInputWithRate(new Prisma.Decimal('7.5')).withholdingRate, '7.50');
});

test('hashFiscalRecordInput is stable across equivalent withholding rate representations', () => {
  assert.equal(
    hashFiscalRecordInput(buildHashInputWithRate(new Prisma.Decimal('15'))),
    hashFiscalRecordInput(buildHashInputWithRate('15.00')),
  );
});

test('canonical hash input rejects non-integer and non-finite numbers', () => {
  // Fractional amounts must arrive as decimal strings so the TS and SQL
  // canonical forms agree on number serialization.
  assert.throws(
    () => hashFiscalRecordInput({ ...baseHashInput(), totalCents: 12100.5 }),
    /must be finite integers/,
  );
  assert.throws(
    () => hashFiscalRecordInput({ ...baseHashInput(), totalCents: Number.POSITIVE_INFINITY }),
    /must be finite integers/,
  );
});

test('createInvoiceFiscalRecord stores hash fields for the first record', async () => {
  const tx = createTransactionMock({ reservedValue: 1 });

  const result = await createInvoiceFiscalRecord(tx, {
    invoiceId,
    organizationId,
    type: 'ALTA',
    createdByUserId: 'user_1',
  }) as unknown as { data: Record<string, unknown> };

  assert.equal(result.data.sequenceNumber, 1);
  assert.equal(result.data.previousRecordId, null);
  assert.equal(result.data.previousHash, null);
  assert.equal(result.data.hashVersion, invoiceFiscalRecordHashVersion);
  assert.equal(result.data.createdByUserId, 'user_1');
  assert.equal(result.data.invoiceType, 'F1');
  assert.equal(result.data.operationDescription, 'Consulting services');
  assert.deepEqual(result.data.taxBreakdown, [{
    taxType: '01',
    taxRegimeKey: '01',
    operationClassification: 'S1',
    exemptOperation: null,
    taxRate: '21.00',
    taxableBaseAmount: '100.00',
    taxAmount: '21.00',
    equivalenceSurchargeRate: null,
    equivalenceSurchargeAmount: null,
  }]);
  assert.ok(result.data.hashInput);
  assert.equal(result.data.hash, hashFiscalRecordInput(result.data.hashInput));
});

test('createInvoiceFiscalRecord stores fiscal address fields in hashInput snapshot', async () => {
  const tx = createTransactionMock({ reservedValue: 1 });

  const result = await createInvoiceFiscalRecord(tx, {
    invoiceId,
    organizationId,
    type: 'ALTA',
    createdByUserId: 'user_1',
  }) as unknown as { data: { hashInput: { snapshot: Record<string, unknown> } } };

  assert.deepEqual(result.data.hashInput.snapshot, {
    sellerAddressLine1: '1 Seller St',
    sellerCity: 'Madrid',
    sellerCountry: 'Spain',
    sellerLegalName: 'Analytical Engines Ltd',
    sellerName: 'Analytical Engines',
    sellerTaxId: 'VAT123',
    customerAddressLine1: '1 Customer St',
    customerCity: 'London',
    customerCountry: 'GB',
    customerEmail: 'billing@ada.example',
    customerName: 'Ada Co',
    customerTaxId: 'CUST-123',
  });
});

test('createInvoiceFiscalRecord links the second record to the previous hash', async () => {
  const previousRecord = {
    id: '1fd9e63f-06fd-459d-bdac-6b90025ff0ab',
    hash: hashFiscalRecordInput(baseHashInput()),
  };
  const tx = createTransactionMock({
    reservedValue: 2,
    previousRecord,
  });

  const result = await createInvoiceFiscalRecord(tx, {
    invoiceId,
    organizationId,
    type: 'ANULACION',
    createdByUserId: null,
  }) as unknown as { data: Record<string, unknown> };

  assert.equal(result.data.previousRecordId, previousRecord.id);
  assert.equal(result.data.previousHash, previousRecord.hash);
  assert.equal(
    (result.data.hashInput as { previousHash: string }).previousHash,
    previousRecord.hash,
  );
});

test('createInvoiceFiscalRecord fails when the invoice cannot be scoped to the organization', async () => {
  for (const testCase of [
    { name: 'missing invoice', invoice: null },
    {
      name: 'invoice outside organization',
      invoice: null,
    },
  ]) {
    const tx = createTransactionMock({
      reservedValue: 1,
      invoice: testCase.invoice,
    });

    await assert.rejects(
      createInvoiceFiscalRecord(tx, {
        invoiceId,
        organizationId,
        type: 'ALTA',
        createdByUserId: 'user_1',
      }),
      /Unable to build invoice fiscal record hash input/,
      testCase.name,
    );
  }
});

test('createInvoiceFiscalRecord keeps organization chains independent', async () => {
  let previousRecordLookup: unknown;
  const tx = createTransactionMock({
    reservedValue: 1,
    invoice: {
      ...invoiceForHash,
      organizationId: otherOrganizationId,
    },
    capturePreviousRecordLookup: (args) => {
      previousRecordLookup = args;
    },
  });

  await createInvoiceFiscalRecord(tx, {
    invoiceId,
    organizationId: otherOrganizationId,
    type: 'ALTA',
    createdByUserId: 'user_1',
  });

  assert.deepEqual(previousRecordLookup, {
    where: {
      organizationId: otherOrganizationId,
      sequenceNumber: {
        lt: 1,
      },
    },
    orderBy: {
      sequenceNumber: 'desc',
    },
    select: {
      id: true,
      hash: true,
    },
  });
});

test('createInvoiceFiscalRecord preserves non-nullish createdByUserId values', async () => {
  const tx = createTransactionMock({ reservedValue: 1 });

  const result = await createInvoiceFiscalRecord(tx, {
    invoiceId,
    organizationId,
    type: 'ALTA',
    createdByUserId: '',
  }) as unknown as { data: Record<string, unknown> };

  assert.equal(result.data.createdByUserId, '');
});

type ChainRecord = {
  id: string;
  sequenceNumber: number;
  hash: string;
  previousHash: string | null;
  previousRecordId: string | null;
  hashInput: Record<string, unknown>;
};

const buildChainRecord = ({
  id,
  sequenceNumber,
  previousRecord = null,
}: {
  id: string;
  sequenceNumber: number;
  previousRecord?: ChainRecord | null;
}): ChainRecord => {
  const hashInput = {
    ...baseHashInput(),
    sequenceNumber,
    previousHash: previousRecord?.hash ?? null,
  };

  return {
    id,
    sequenceNumber,
    hashInput,
    hash: hashFiscalRecordInput(hashInput),
    previousHash: previousRecord?.hash ?? null,
    previousRecordId: previousRecord?.id ?? null,
  };
};

const createChainClientMock = (
  records: ChainRecord[],
  captureFindManyArgs?: (args: unknown) => void,
) =>
  ({
    invoiceFiscalRecord: {
      findMany: async (args: unknown) => {
        captureFindManyArgs?.(args);
        return records;
      },
    },
  }) as unknown as Prisma.TransactionClient;

const recordOneId = '1fd9e63f-06fd-459d-bdac-6b90025ff0ab';
const recordTwoId = '2ab8f74a-17ae-4ce1-9e0c-5c91136aa1bc';

test('verifyInvoiceFiscalRecordChain accepts a valid chain and queries in sequence order', async () => {
  const first = buildChainRecord({ id: recordOneId, sequenceNumber: 1 });
  const second = buildChainRecord({
    id: recordTwoId,
    sequenceNumber: 2,
    previousRecord: first,
  });
  let findManyArgs: unknown;
  const client = createChainClientMock([first, second], (args) => {
    findManyArgs = args;
  });

  const result = await verifyInvoiceFiscalRecordChain(client, organizationId);

  assert.deepEqual(result, {
    ok: true,
    organizationId,
    recordCount: 2,
    issues: [],
  });
  assert.deepEqual(findManyArgs, {
    where: { organizationId },
    orderBy: { sequenceNumber: 'asc' },
    select: {
      id: true,
      sequenceNumber: true,
      hash: true,
      previousHash: true,
      previousRecordId: true,
      hashInput: true,
    },
  });
});

test('verifyInvoiceFiscalRecordChain accepts an empty chain', async () => {
  const client = createChainClientMock([]);

  const result = await verifyInvoiceFiscalRecordChain(client, organizationId);

  assert.deepEqual(result, {
    ok: true,
    organizationId,
    recordCount: 0,
    issues: [],
  });
});

test('verifyInvoiceFiscalRecordChain detects tampered record content', async () => {
  const first = buildChainRecord({ id: recordOneId, sequenceNumber: 1 });
  // Mutate the stored input without recomputing the stored hash.
  const tampered: ChainRecord = {
    ...first,
    hashInput: { ...first.hashInput, totalCents: 99999 },
  };
  const client = createChainClientMock([tampered]);

  const result = await verifyInvoiceFiscalRecordChain(client, organizationId);

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, [
    { recordId: recordOneId, sequenceNumber: 1, reason: 'hashMismatch' },
  ]);
});

test('verifyInvoiceFiscalRecordChain detects a broken previous-hash link', async () => {
  const first = buildChainRecord({ id: recordOneId, sequenceNumber: 1 });
  const second = buildChainRecord({
    id: recordTwoId,
    sequenceNumber: 2,
    previousRecord: first,
  });
  const broken: ChainRecord = { ...second, previousHash: 'tampered-hash' };
  const client = createChainClientMock([first, broken]);

  const result = await verifyInvoiceFiscalRecordChain(client, organizationId);

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, [
    { recordId: recordTwoId, sequenceNumber: 2, reason: 'previousHashMismatch' },
  ]);
});

test('verifyInvoiceFiscalRecordChain flags a first record that is not a chain start', async () => {
  const orphan: ChainRecord = {
    ...buildChainRecord({ id: recordOneId, sequenceNumber: 1 }),
    previousHash: 'dangling-hash',
    previousRecordId: recordTwoId,
  };
  const client = createChainClientMock([orphan]);

  const result = await verifyInvoiceFiscalRecordChain(client, organizationId);

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, [
    { recordId: recordOneId, sequenceNumber: 1, reason: 'chainStartMismatch' },
  ]);
});

test('verifyInvoiceFiscalRecordChain flags a non-first record missing its link', async () => {
  const first = buildChainRecord({ id: recordOneId, sequenceNumber: 1 });
  const detached: ChainRecord = {
    ...buildChainRecord({ id: recordTwoId, sequenceNumber: 2, previousRecord: first }),
    previousHash: null,
    previousRecordId: null,
  };
  const client = createChainClientMock([first, detached]);

  const result = await verifyInvoiceFiscalRecordChain(client, organizationId);

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, [
    { recordId: recordTwoId, sequenceNumber: 2, reason: 'chainLinkMissing' },
  ]);
});
