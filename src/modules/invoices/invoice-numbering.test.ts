import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import { nextInvoiceNumber } from "./invoice-numbering";

const createTransactionMock = (
  reservedValue: bigint | number,
  capture?: (strings: TemplateStringsArray, values: unknown[]) => void,
) =>
  ({
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      capture?.(strings, values);
      return [{ reservedValue }];
    },
  }) as unknown as Prisma.TransactionClient;

test("nextInvoiceNumber reserves the first sequence value", async () => {
  const year = new Date().getFullYear();
  const tx = createTransactionMock(1);

  const number = await nextInvoiceNumber(tx, "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab");

  assert.equal(number, `INV-${year}-0001`);
});

test("nextInvoiceNumber formats an existing sequence value", async () => {
  const year = new Date().getFullYear();
  const tx = createTransactionMock(42n);

  const number = await nextInvoiceNumber(tx, "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab");

  assert.equal(number, `INV-${year}-0042`);
});

test("nextInvoiceNumber passes organization and year to the atomic sequence query", async () => {
  const organizationId = "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab";
  const year = new Date().getFullYear();
  let query = "";
  let queryValues: unknown[] = [];
  const tx = createTransactionMock(1, (strings, values) => {
    query = strings.join("?");
    queryValues = values;
  });

  await nextInvoiceNumber(tx, organizationId);

  assert.match(query, /INSERT INTO "InvoiceNumberSequence"/);
  assert.match(query, /ON CONFLICT \("organizationId", "year"\)/);
  assert.match(query, /RETURNING "nextValue" - 1 AS "reservedValue"/);
  assert.deepEqual(queryValues, [organizationId, year]);
});
