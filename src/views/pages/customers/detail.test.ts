import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

test('customer detail profile card links to edit customer', () => {
  const template = readFileSync(
    path.join(
      process.cwd(),
      'src',
      'views',
      'pages',
      'customers',
      'detail.njk',
    ),
    'utf8',
  );

  assert.match(template, /href="\/customers\/{{ customer\.id }}\/edit"/);
  assert.match(template, /aria-label="{{ t\('customers\.actions\.edit'\) }}"/);
});

test('customer detail new invoice action preselects the current customer', () => {
  const template = readFileSync(
    path.join(
      process.cwd(),
      'src',
      'views',
      'pages',
      'customers',
      'detail.njk',
    ),
    'utf8',
  );

  assert.match(
    template,
    /href="\/invoices\/new\?customerId={{ customer\.id }}">{{ t\('customers\.actions\.newInvoice'\) }}<\/a>/,
  );
});

test('customer detail actions include a primary edit customer button', () => {
  const template = readFileSync(
    path.join(
      process.cwd(),
      'src',
      'views',
      'pages',
      'customers',
      'detail.njk',
    ),
    'utf8',
  );

  assert.match(
    template,
    /href="\/customers\/{{ customer\.id }}\/edit">{{ t\('customers\.actions\.edit'\) }}<\/a>/,
  );
  assert.match(template, /btn btn-primary/);
});

test('customer detail includes archive restore and guarded delete actions', () => {
  const template = readFileSync(
    path.join(
      process.cwd(),
      'src',
      'views',
      'pages',
      'customers',
      'detail.njk',
    ),
    'utf8',
  );

  assert.match(template, /action="\/customers\/{{ customer\.id }}\/archive"/);
  assert.match(template, /action="\/customers\/{{ customer\.id }}\/restore"/);
  assert.match(template, /'\/customers\/' ~ customer\.id ~ '\/delete'/);
  assert.match(template, /customer\.invoices\.length == 0/);
  assert.match(template, /elif not customer\.archivedAt/);
  assert.match(template, /if customer\.archivedAt/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
});

test('customer detail confirms delete action in a dialog before submitting', () => {
  const template = readFileSync(
    path.join(
      process.cwd(),
      'src',
      'views',
      'pages',
      'customers',
      'detail.njk',
    ),
    'utf8',
  );

  assert.match(
    template,
    /from "components\/confirm-dialog\.njk" import confirmDialog/,
  );
  assert.match(
    template,
    /<button class="btn btn-full btn-danger" type="button" data-dialog-open="delete-customer-dialog">{{ t\('customers\.actions\.delete'\) }}<\/button>/,
  );
  assert.match(template, /confirmDialog\(/);
  assert.match(template, /'delete-customer-dialog'/);
  assert.match(template, /t\('customers\.dialogs\.delete\.title'\)/);
  assert.match(
    template,
    /t\('customers\.dialogs\.delete\.description', { name: customer\.name }\)/,
  );
  assert.match(template, /'\/customers\/' ~ customer\.id ~ '\/delete'/);
  assert.match(template, /csrfToken/);
  assert.doesNotMatch(
    template,
    /<form method="post" action="\/customers\/{{ customer\.id }}\/delete">\s*<input type="hidden" name="_csrf" value="{{ csrfToken }}">\s*<button class="btn btn-full btn-danger" type="submit">/,
  );
});

test('customer detail visibly indicates archived customers', () => {
  const template = readFileSync(
    path.join(
      process.cwd(),
      'src',
      'views',
      'pages',
      'customers',
      'detail.njk',
    ),
    'utf8',
  );

  assert.match(template, /t\('customers\.detail\.archived'\)/);
  assert.match(template, /{{ customer\.archivedAt \| date\(currentLocale\) }}/);
});

test('customer detail invoice table renders status badges', () => {
  const template = readFileSync(
    path.join(
      process.cwd(),
      'src',
      'views',
      'pages',
      'customers',
      'detail.njk',
    ),
    'utf8',
  );

  assert.match(template, /from "components\/ui\/badge\.njk" import badge/);
  assert.match(template, /for invoice in invoiceRows/);
  assert.match(
    template,
    /for statusBadge in invoice\.statusBadges/,
  );
  assert.match(
    template,
    /badge\(t\(statusBadge\.labelKey\) if statusBadge\.labelKey else statusBadge\.label, statusBadge\.variant\)/,
  );
  assert.match(template, /invoice\.dueDate \| date\(currentLocale\)/);
  assert.match(template, /invoice\.totalCents \| money\(invoice\.currency, currentLocale\)/);
  assert.doesNotMatch(template, /{{ invoice\.status }}/);
});
