import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const template = readFileSync(
  path.join(process.cwd(), "src", "views", "pages", "invoices", "form.njk"),
  "utf8",
);

test("invoice form includes payment instructions and internal notes fields", () => {
  assert.match(template, /data-unsaved-changes-guard/);
  assert.match(template, /name="paymentInstructions"/);
  assert.match(template, /values\.paymentInstructions/);
  assert.match(template, /errors\.paymentInstructions/);
  assert.match(template, /name="notes"/);
  assert.match(template, /Internal notes for your team/);
  assert.match(template, /errors\.notes/);
});

test("invoice form includes catalog autocomplete hooks for line descriptions", () => {
  assert.match(template, /data-invoice-catalog-combobox/);
  assert.match(template, /data-invoice-catalog-input/);
  assert.match(template, /data-invoice-catalog-results/);
  assert.match(template, /role="combobox"/);
  assert.match(template, /aria-autocomplete="list"/);
  assert.match(template, /data-invoice-line-template/);
  assert.match(template, /line\.unitPrice if line\.unitPrice is defined else 0/);
});
