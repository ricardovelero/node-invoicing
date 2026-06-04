import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const readTemplate = (fileName: string) =>
  readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", fileName),
    "utf8",
  );

test("invoice detail links to print page only for printable invoices", () => {
  const template = readTemplate("detail.njk");

  assert.match(template, /if invoiceDisplay\.isPrintable/);
  assert.match(template, /href="\/invoices\/{{ invoice\.id }}\/print"/);
  assert.match(template, /Print \/ Save as PDF/);
  assert.match(template, /href="\/invoices\/{{ invoice\.id }}\/email"/);
  assert.match(template, /Send invoice email/);
});

test("invoice detail links to edit page only for editable invoices", () => {
  const template = readTemplate("detail.njk");

  assert.match(template, /if canEditInvoice/);
  assert.match(template, /href="\/invoices\/{{ invoice\.id }}\/edit"/);
  assert.match(template, /Edit invoice/);
});

test("invoice detail includes email delivery history", () => {
  const template = readTemplate("detail.njk");

  assert.match(template, /Email deliveries/);
  assert.match(template, /for delivery in emailDeliveries/);
  assert.match(template, /delivery\.status/);
  assert.match(template, /Accepted for delivery/);
  assert.match(template, /Delivered to recipient/);
  assert.doesNotMatch(template, /Provider message/);
});
