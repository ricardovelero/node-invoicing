import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("invoice index links invoice numbers to detail pages", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", "index.njk"),
    "utf8",
  );

  assert.match(template, /href="\/invoices\/{{ invoice\.id }}"/);
});

test("invoice index renders status badges from presenter rows", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", "index.njk"),
    "utf8",
  );

  assert.match(template, /from "components\/badge\.njk" import badge/);
  assert.match(template, /for invoice in invoiceRows/);
  assert.match(template, /invoice\.customerName/);
  assert.match(template, /badge\(invoice\.statusBadge\.label, invoice\.statusBadge\.variant\)/);
  assert.doesNotMatch(template, /invoice\.status }}<\/td>/);
});
