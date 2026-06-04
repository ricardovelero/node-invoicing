import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const template = readFileSync(
  path.join(
    process.cwd(),
    "src",
    "views",
    "pages",
    "public",
    "invoices",
    "print.njk",
  ),
  "utf8",
);
const printBody = readFileSync(
  path.join(process.cwd(), "src", "views", "components", "invoice-print-body.njk"),
  "utf8",
);

test("public invoice print view omits protected invoice navigation", () => {
  assert.doesNotMatch(template, /Back to invoice/);
  assert.doesNotMatch(template, /data-print-button/);
  assert.match(template, /include "components\/invoice-print-body\.njk"/);

  assert.match(printBody, /Invoice Number:/);
  assert.match(printBody, /Issue Date:/);
  assert.match(printBody, /Due Date:/);
  assert.match(printBody, /grid-cols-\[120px_1fr\]/);
  assert.match(printBody, /{{ invoice\.number }}/);
  assert.match(printBody, /{{ snapshot\.customerName }}/);
  assert.doesNotMatch(printBody, /sm:grid-cols-3/);
});

test("public invoice print view shows payment status totals", () => {
  assert.match(printBody, /paymentSummary\.paidCents/);
  assert.match(printBody, /paymentSummary\.outstandingCents/);
});
