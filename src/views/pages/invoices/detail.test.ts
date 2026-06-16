import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const readTemplate = (fileName: string) =>
  readFileSync(
    path.join(process.cwd(), 'src', 'views', 'pages', 'invoices', fileName),
    'utf8',
  );

test('invoice detail links to print page only for printable invoices', () => {
  const template = readTemplate('detail.njk');

  assert.match(template, /if invoiceDisplay\.isPrintable/);
  assert.match(template, /href="\/invoices\/{{ invoice\.id }}\/print"/);
  assert.match(template, /t\('invoices\.actions\.print'\)/);
  assert.match(template, /href="\/invoices\/{{ invoice\.id }}\/pdf"/);
  assert.match(template, /t\('invoices\.actions\.downloadPdf'\)/);
  assert.match(template, /href="\/invoices\/{{ invoice\.id }}\/email"/);
  assert.match(template, /t\('invoices\.actions\.sendEmail'\)/);
});

test('invoice detail links to edit page only for editable invoices', () => {
  const template = readTemplate('detail.njk');

  assert.match(template, /if canEditInvoice/);
  assert.match(template, /href="\/invoices\/{{ invoice\.id }}\/edit"/);
  assert.match(template, /t\('invoices\.actions\.editInvoice'\)/);
});

test('invoice detail includes email delivery history', () => {
  const template = readTemplate('detail.njk');

  assert.match(template, /t\('invoices\.detail\.emailDeliveries'\)/);
  assert.match(template, /for delivery in emailDeliveries/);
  assert.match(template, /from "components\/ui\/badge\.njk" import badge/);
  assert.match(template, /delivery\.status/);
  assert.match(
    template,
    /badge\(t\(delivery\.statusBadge\.labelKey\) if delivery\.statusBadge\.labelKey else delivery\.statusBadge\.label, delivery\.statusBadge\.variant\)/,
  );
  assert.match(template, /t\('invoices\.detail\.deliveryUpdates\.sent'\)/);
  assert.match(template, /t\('invoices\.detail\.deliveryUpdates\.delivered'\)/);
  assert.doesNotMatch(
    template,
    /<td class="px-4 py-3">{{ delivery\.status }}<\/td>/,
  );
  assert.doesNotMatch(template, /Provider message/);
});

test('invoice detail renders the invoice status with the badge component', () => {
  const template = readTemplate('detail.njk');

  assert.match(template, /from "components\/ui\/badge\.njk" import badge/);
  assert.match(
    template,
    /for statusBadge in invoiceStatusBadges/,
  );
  assert.match(
    template,
    /badge\(t\(statusBadge\.labelKey\) if statusBadge\.labelKey else statusBadge\.label, statusBadge\.variant\)/,
  );
  assert.doesNotMatch(
    template,
    /'OVERDUE' if isEffectivelyOverdue else invoice\.status/,
  );
});

test('invoice detail uses clear line item display columns', () => {
  const template = readTemplate('detail.njk');

  assert.match(template, /t\('invoices\.table\.description'\)/);
  assert.match(template, /t\('invoices\.table\.quantity'\)/);
  assert.match(template, /t\('invoices\.table\.unitPrice'\)/);
  assert.match(template, /t\('invoices\.table\.discount'\)/);
  assert.match(template, /t\('invoices\.table\.net'\)/);
  assert.match(template, /t\('invoices\.table\.tax'\)/);
  assert.match(template, /t\('invoices\.table\.total'\)/);
  assert.match(template, /for line in invoiceLineDisplays/);
  assert.match(template, /line\.netCents/);
  assert.match(template, /line\.taxRateLabel/);
  assert.match(template, /line\.displayTotalCents/);
  assert.doesNotMatch(template, />Unit<\/th>/);
  assert.doesNotMatch(template, /Line net/);
});

test('invoice detail includes separate inline metadata editors', () => {
  const template = readTemplate('detail.njk');

  assert.match(template, /action="\/invoices\/{{ invoice\.id }}\/metadata"/);
  assert.equal(template.match(/data-unsaved-changes-guard/g)?.length, 3);
  assert.match(template, /data-inline-editor/);
  assert.match(template, /data-inline-editor-open/);
  assert.match(template, /data-inline-editor-panel/);
  assert.match(template, /data-inline-editor-cancel/);
  assert.match(template, /t\('invoices\.detail\.editNote'\)/);
  assert.match(template, /t\('invoices\.actions\.saveNote'\)/);
  assert.match(template, /t\('invoices\.actions\.saveInstructions'\)/);
  assert.match(template, /title="{{ t\('invoices\.detail\.editPaymentInstructions'\) }}"/);
  assert.match(template, /name="intent" value="notes"/);
  assert.match(template, /name="intent" value="paymentInstructions"/);
  assert.match(template, /textareaField\('paymentInstructions'/);
  assert.match(template, /metadataValues\.paymentInstructions/);
  assert.match(template, /metadataErrors\.paymentInstructions/);
  assert.match(template, /textareaField\('notes'/);
  assert.match(template, /t\('invoices\.detail\.internalNotes'\)/);
  assert.match(template, /metadataValues\.notes/);
  assert.match(template, /metadataErrors\.notes/);
  assert.doesNotMatch(template, /Invoice details/);
  assert.doesNotMatch(template, /Save invoice details/);
});

test('invoice detail confirms void action in a dialog before submitting', () => {
  const template = readTemplate('detail.njk');

  assert.match(
    template,
    /from "components\/confirm-dialog\.njk" import confirmDialog/,
  );
  assert.match(
    template,
    /<button class="btn btn-full btn-danger" type="button" data-dialog-open="void-invoice-dialog">{{ t\('invoices\.actions\.voidInvoice'\) }}<\/button>/,
  );
  assert.match(template, /confirmDialog\(/);
  assert.match(template, /'void-invoice-dialog'/);
  assert.match(template, /t\('invoices\.dialogs\.void\.title'\)/);
  assert.match(template, /t\('invoices\.dialogs\.void\.description'\)/);
  assert.match(template, /'\/invoices\/' ~ invoice\.id ~ '\/status'/);
  assert.match(template, /csrfToken/);
  assert.match(template, /<input type="hidden" name="action" value="void">/);
  assert.doesNotMatch(
    template,
    /<form method="post" action="\/invoices\/{{ invoice\.id }}\/status">\s*<input type="hidden" name="_csrf" value="{{ csrfToken }}">\s*<input type="hidden" name="action" value="void">\s*<button class="btn btn-full btn-danger" type="submit">/,
  );
});
