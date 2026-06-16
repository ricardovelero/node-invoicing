import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("item form includes csrf and configurable create/edit fields", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "items", "form.njk"),
    "utf8",
  );

  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /action="{{ formAction or '\/items' }}"/);
  assert.match(template, /data-unsaved-changes-guard/);
  assert.match(template, /name="name"/);
  assert.match(template, /name="description"/);
  assert.match(template, /name="unitPrice"/);
  assert.match(template, /name="currency"/);
  assert.match(template, /for currency in currencies/);
  assert.match(template, /name="taxRate"/);
  assert.match(template, /{{ submitLabel or t\('items\.actions\.create'\) }}/);
  assert.match(template, /href="{{ cancelHref or '\/items' }}"/);
  assert.match(template, /t\('items\.form\.fields\.unitPrice'\)/);
  assert.match(template, /t\('common\.actions\.cancel'\)/);
  assert.match(
    template,
    /<label for="name">{{ t\('items\.form\.fields\.name'\) }} <span aria-hidden="true">\*<\/span><\/label>/,
  );
  assert.match(template, /<input id="name" name="name"[^>]+required>/);
  assert.match(
    template,
    /<label for="description">{{ t\('items\.form\.fields\.description'\) }} <span aria-hidden="true">\*<\/span><\/label>/,
  );
  assert.match(template, /<textarea id="description" name="description" rows="4" required>/);
  assert.match(template, /<label for="unitPrice">{{ t\('items\.form\.fields\.unitPrice'\) }}<\/label>/);
  assert.match(template, /<label for="currency">{{ t\('items\.form\.fields\.currency'\) }}<\/label>/);
  assert.match(template, /<label for="taxRate">{{ t\('items\.form\.fields\.taxRate'\) }}<\/label>/);
  assert.doesNotMatch(template, /Unit price is a reusable amount/);
});
