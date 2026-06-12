import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const template = readFileSync(
  path.join(process.cwd(), 'src', 'views', 'components', 'confirm-dialog.njk'),
  'utf8',
);

test('confirm dialog macro renders a native dialog with a protected post form', () => {
  assert.match(template, /<dialog id="{{ id }}"/);
  assert.match(template, /aria-labelledby="{{ id }}-title"/);
  assert.match(template, /{{ title }}/);
  assert.match(template, /{{ description }}/);
  assert.match(template, /<button class="btn btn-secondary" type="button" data-dialog-close>{{ cancelLabel }}<\/button>/);
  assert.match(template, /<form method="{{ method }}" action="{{ formAction }}">/);
  assert.match(template, /<input type="hidden" name="_csrf" value="{{ csrfToken }}">/);
  assert.match(template, /{{ caller\(\) }}/);
  assert.match(template, /btn-danger' if destructive else 'btn-primary'/);
  assert.match(template, /type="submit">{{ confirmLabel }}<\/button>/);
});
