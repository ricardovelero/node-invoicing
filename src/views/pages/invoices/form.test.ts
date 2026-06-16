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
  assert.match(template, /labelField\('paymentInstructions'/);
  assert.match(template, /textareaField\('paymentInstructions', value=values\.paymentInstructions/);
  assert.match(template, /values\.paymentInstructions/);
  assert.match(template, /errors\.paymentInstructions/);
  assert.match(template, /labelField\('notes'/);
  assert.match(template, /textareaField\('notes', value=values\.notes/);
  assert.match(template, /t\('invoices\.form\.placeholders\.notes'\)/);
  assert.match(template, /errors\.notes/);
});

test("invoice form uses atomic field macros for non-line-item fields", () => {
  assert.match(template, /from "components\/ui\/label-field\.njk" import labelField/);
  assert.match(template, /from "components\/ui\/input-field\.njk" import inputField/);
  assert.match(template, /from "components\/ui\/select-field\.njk" import selectField/);
  assert.match(template, /from "components\/ui\/textarea-field\.njk" import textareaField/);
  assert.doesNotMatch(template, /from "components\/form-field\.njk"/);
  assert.match(template, /labelField\('currency'[\s\S]*?required=true/);
  assert.match(template, /selectField\('currency', currencyOptions/);
  assert.match(template, /data-invoice-currency-select/);
  assert.match(template, /labelField\('issueDate'[\s\S]*?required=true/);
  assert.match(template, /inputField\('issueDate'[\s\S]*?data-invoice-issue-date/);
  assert.match(template, /labelField\('dueDate'[\s\S]*?required=true/);
  assert.match(template, /inputField\('dueDate'[\s\S]*?data-invoice-due-date/);
  assert.match(template, /describedBy='dueDate-error'/);
  assert.match(template, /errorAttrs='data-invoice-due-date-error'/);
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
