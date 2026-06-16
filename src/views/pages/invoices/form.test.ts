import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const template = readFileSync(
  path.join(process.cwd(), "src", "views", "pages", "invoices", "form.njk"),
  "utf8",
);
const lineItemRowTemplate = readFileSync(
  path.join(
    process.cwd(),
    "src",
    "views",
    "pages",
    "invoices",
    "_line-item-row.njk",
  ),
  "utf8",
);
const invoiceFormSource = `${template}\n${lineItemRowTemplate}`;

test("invoice form includes payment instructions and internal notes fields", () => {
  assert.match(template, /data-unsaved-changes-guard/);
  assert.match(template, /textareaField\('paymentInstructions'/);
  assert.match(template, /values\.paymentInstructions/);
  assert.match(template, /errors\.paymentInstructions/);
  assert.match(template, /textareaField\('notes'/);
  assert.match(template, /t\('invoices\.form\.placeholders\.notes'\)/);
  assert.match(template, /errors\.notes/);
});

test("invoice form includes catalog autocomplete hooks for line descriptions", () => {
  assert.match(invoiceFormSource, /data-invoice-catalog-combobox/);
  assert.match(invoiceFormSource, /data-invoice-catalog-input/);
  assert.match(invoiceFormSource, /data-invoice-catalog-results/);
  assert.match(invoiceFormSource, /role="combobox"/);
  assert.match(invoiceFormSource, /aria-autocomplete="list"/);
  assert.match(template, /data-invoice-line-template/);
  assert.match(invoiceFormSource, /if not isTemplate and line\.unitPrice is defined/);
  assert.match(invoiceFormSource, /value="{{ unitPriceValue }}"/);
});

test("invoice form includes inline save-to-catalog hooks", () => {
  assert.match(invoiceFormSource, /data-invoice-catalog-save/);
  assert.match(invoiceFormSource, /translate\('invoices\.form\.catalog\.notInCatalog'\)/);
  assert.match(invoiceFormSource, /translate\('invoices\.actions\.saveForFutureUse'\)/);
  assert.match(invoiceFormSource, /data-invoice-catalog-save-name/);
  assert.match(invoiceFormSource, /data-invoice-catalog-save-submit/);
  assert.match(
    invoiceFormSource,
    /data-invoice-catalog-save-cancel>{{ translate\('common\.actions\.cancel'\) }}/,
  );
  assert.match(
    invoiceFormSource,
    /data-invoice-catalog-save-success>{{ translate\('invoices\.form\.catalog\.saved'\) }}/,
  );
  assert.match(invoiceFormSource, /translate\('invoices\.form\.catalog\.saveError'\)/);
  assert.match(
    invoiceFormSource,
    /data-invoice-catalog-save-retry>{{ translate\('invoices\.actions\.retry'\) }}/,
  );
});

test("invoice form renders right-aligned new invoice draft and send actions", () => {
  assert.match(template, /flex items-center justify-end gap-3/);
  assert.match(template, /href="{{ cancelHref or '\/invoices' }}">{{ t\('common\.actions\.cancel'\) }}/);
  assert.match(template, /name="intent" value="saveDraft"/);
  assert.match(template, /name="intent" value="saveAndSend"/);
  assert.match(template, /{{ sendSubmitLabel }}/);
  assert.match(template, /{% if sendSubmitLabel %}/);
  assert.match(template, /{% else %}/);
});

test("invoice form renders the IRPF section only when withholding options are available", () => {
  assert.match(template, /if withholdingOptions\.isAvailable/);
  assert.match(template, /name="applyWithholding"/);
  assert.match(template, /data-invoice-apply-withholding/);
  assert.match(template, /name="withholdingType" value="IRPF"/);
  assert.match(template, /data-invoice-withholding-rate/);
  assert.match(template, /data-invoice-withholding-row/);
});

test("invoice form builds rate options from config and hides custom input by default", () => {
  assert.match(template, /{% for option in withholdingOptions\.rateOptions %}/);
  assert.match(
    template,
    /value="{{ option\.value }}" {{ 'selected' if values\.withholdingRateType == option\.value/,
  );
  assert.match(
    template,
    /{{ 'hidden' if values\.withholdingRateType != 'custom' else '' }}" data-invoice-withholding-custom-rate/,
  );
});
