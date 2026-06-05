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
  assert.match(template, /{{ submitLabel or 'Create item' }}/);
  assert.match(template, /href="{{ cancelHref or '\/items' }}"/);
  assert.doesNotMatch(template, /Unit price is a reusable amount/);
});
