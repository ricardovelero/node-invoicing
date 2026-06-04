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

test("public invoice print view omits protected invoice navigation", () => {
  assert.doesNotMatch(template, /Back to invoice/);
  assert.doesNotMatch(template, /data-print-button/);
  assert.match(template, /{{ invoice\.number }}/);
  assert.match(template, /{{ snapshot\.customerName }}/);
});

test("public invoice print view shows payment status totals", () => {
  assert.match(template, /paymentSummary\.paidCents/);
  assert.match(template, /paymentSummary\.outstandingCents/);
});
