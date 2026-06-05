import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("dashboard latest invoices render status badges", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "dashboard.njk"),
    "utf8",
  );

  assert.match(template, /from "components\/badge\.njk" import badge/);
  assert.match(template, /for invoice in latestInvoiceRows/);
  assert.match(template, /invoice\.customerName/);
  assert.match(template, /badge\(invoice\.statusBadge\.label, invoice\.statusBadge\.variant\)/);
  assert.doesNotMatch(template, /{{ invoice\.status }}/);
});

test("dashboard open balance renders each currency total", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "dashboard.njk"),
    "utf8",
  );

  assert.match(template, /for balance in metrics\.openBalances/);
  assert.match(
    template,
    /balance\.totalCents \| money\(balance\.currency, currentOrganization\.locale\)/,
  );
  assert.doesNotMatch(template, /Mixed currencies/);
});
