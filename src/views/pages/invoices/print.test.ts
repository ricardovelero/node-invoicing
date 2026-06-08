import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

test('invoice print template includes printable invoice sections and action', () => {
  const template = readFileSync(
    path.join(process.cwd(), 'src', 'views', 'pages', 'invoices', 'print.njk'),
    'utf8',
  );
  const printBody = readFileSync(
    path.join(
      process.cwd(),
      'src',
      'views',
      'components',
      'invoice-print-body.njk',
    ),
    'utf8',
  );

  assert.doesNotMatch(template, /extends "layouts\/app\.njk"/);
  assert.match(template, /include "components\/invoice-print-body\.njk"/);
  assert.match(template, /Print/);
  assert.match(template, /data-print-button/);
  assert.match(template, /<script defer src="\/assets\/app\.js"><\/script>/);
  assert.doesNotMatch(template, /onclick=/);

  assert.match(printBody, /class="invoice-page"/);
  assert.match(printBody, /Seller/);
  assert.match(printBody, /Customer/);
  assert.match(printBody, /Invoice Number:/);
  assert.match(printBody, /Issue Date:/);
  assert.match(printBody, /Due Date:/);
  assert.match(printBody, /grid-cols-\[120px_1fr\]/);
  assert.match(printBody, /{{ invoice\.number }}/);
  assert.match(printBody, /{{ invoice\.issueDate \| date }}/);
  assert.match(printBody, /{{ invoice\.dueDate \| date }}/);
  assert.doesNotMatch(printBody, /sm:grid-cols-3/);
  assert.match(printBody, /Unit Price/);
  assert.match(printBody, /Net/);
  assert.match(printBody, /for line in invoiceLineDisplays/);
  assert.match(printBody, /line\.netCents/);
  assert.match(printBody, /line\.taxRateLabel/);
  assert.match(printBody, /line\.displayTotalCents/);
  assert.doesNotMatch(printBody, />Unit<\/th>/);
  assert.doesNotMatch(printBody, /Line net/);
  assert.match(
    printBody,
    /{{ snapshot\.subtotalCents \| money\(invoiceDisplay\.currency, currentOrganization\.locale\) }}/,
  );
  assert.match(
    printBody,
    /{{ snapshot\.discountCents \| money\(invoiceDisplay\.currency, currentOrganization\.locale\) }}/,
  );
  assert.match(
    printBody,
    /{{ snapshot\.taxCents \| money\(invoiceDisplay\.currency, currentOrganization\.locale\) }}/,
  );
  assert.match(
    printBody,
    /{{ snapshot\.totalCents \| money\(invoiceDisplay\.currency, currentOrganization\.locale\) }}/,
  );
  assert.match(printBody, /paymentSummary\.paidCents/);
  assert.match(printBody, /paymentSummary\.outstandingCents/);
  assert.match(printBody, /Payment instructions/);
});
