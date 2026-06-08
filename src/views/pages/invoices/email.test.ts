import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const template = readFileSync(
  path.join(process.cwd(), 'src', 'views', 'pages', 'invoices', 'email.njk'),
  'utf8',
);

test('invoice email form posts to the invoice email action with csrf', () => {
  assert.match(template, /action="\/invoices\/{{ invoice\.id }}\/email"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /name="toEmail"/);
  assert.match(template, /Send invoice via email/);
});

test('invoice email form previews subject and outstanding amount', () => {
  assert.match(template, /Invoice {{ invoice\.number }} from/);
  assert.match(template, /paymentSummary\.outstandingCents/);
});
