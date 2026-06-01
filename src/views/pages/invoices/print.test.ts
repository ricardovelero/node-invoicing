import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("invoice print template includes printable invoice sections and action", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", "print.njk"),
    "utf8",
  );

  assert.doesNotMatch(template, /extends "layouts\/app\.njk"/);
  assert.match(template, /class="invoice-page"/);
  assert.match(template, /Seller/);
  assert.match(template, /Customer/);
  assert.match(template, /{{ invoice\.number }}/);
  assert.match(template, /{{ invoice\.issueDate \| date }}/);
  assert.match(template, /{{ invoice\.dueDate \| date }}/);
  assert.match(template, /for line in invoice\.lines/);
  assert.match(template, /{{ snapshot\.subtotalCents \| money\(invoiceDisplay\.currency, currentOrganization\.locale\) }}/);
  assert.match(template, /{{ snapshot\.discountCents \| money\(invoiceDisplay\.currency, currentOrganization\.locale\) }}/);
  assert.match(template, /{{ snapshot\.taxCents \| money\(invoiceDisplay\.currency, currentOrganization\.locale\) }}/);
  assert.match(template, /{{ snapshot\.totalCents \| money\(invoiceDisplay\.currency, currentOrganization\.locale\) }}/);
  assert.match(template, /Payment instructions/);
  assert.match(template, /Print \/ Save as PDF/);
  assert.match(template, /data-print-button/);
  assert.match(template, /<script defer src="\/assets\/app\.js"><\/script>/);
  assert.doesNotMatch(template, /onclick=/);
});
