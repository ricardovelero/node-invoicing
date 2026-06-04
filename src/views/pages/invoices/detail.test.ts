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

test("invoice detail uses clear line item display columns", () => {
  const template = readTemplate("detail.njk");

  assert.match(template, /Description/);
  assert.match(template, /Qty/);
  assert.match(template, /Unit Price/);
  assert.match(template, /Discount/);
  assert.match(template, /Net/);
  assert.match(template, /Tax/);
  assert.match(template, /Total/);
  assert.match(template, /for line in invoiceLineDisplays/);
  assert.match(template, /line\.netCents/);
  assert.match(template, /line\.taxRateLabel/);
  assert.match(template, /line\.displayTotalCents/);
  assert.doesNotMatch(template, />Unit<\/th>/);
  assert.doesNotMatch(template, /Line net/);
});

test("invoice detail includes separate inline metadata editors", () => {
  const template = readTemplate("detail.njk");

  assert.match(template, /action="\/invoices\/{{ invoice\.id }}\/metadata"/);
  assert.match(template, /data-inline-editor/);
  assert.match(template, /data-inline-editor-open/);
  assert.match(template, /data-inline-editor-panel/);
  assert.match(template, /data-inline-editor-cancel/);
  assert.match(template, /Edit invoice note/);
  assert.match(template, /Save note/);
  assert.match(template, /Save instructions/);
  assert.match(template, /title="Edit payment instructions"/);
  assert.match(template, /name="intent" value="notes"/);
  assert.match(template, /name="intent" value="paymentInstructions"/);
  assert.match(template, /name="paymentInstructions"/);
  assert.match(template, /metadataValues\.paymentInstructions/);
  assert.match(template, /metadataErrors\.paymentInstructions/);
  assert.match(template, /name="notes"/);
  assert.match(template, /Internal notes/);
  assert.match(template, /metadataValues\.notes/);
  assert.match(template, /metadataErrors\.notes/);
  assert.doesNotMatch(template, /Invoice details/);
  assert.doesNotMatch(template, /Save invoice details/);
});
