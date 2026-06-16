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
  assert.match(template, /from "components\/form-field\.njk" import field, textareaField, selectField/);
  assert.match(template, /field\('name'/);
  assert.match(template, /textareaField\('description'/);
  assert.match(template, /field\('unitPrice'/);
  assert.match(template, /selectField\('currency'/);
  assert.match(template, /field\('taxRate'/);
  assert.match(template, /{{ submitLabel or t\('items\.actions\.create'\) }}/);
  assert.match(template, /href="{{ cancelHref or '\/items' }}"/);
  assert.match(template, /t\('items\.form\.fields\.unitPrice'\)/);
  assert.match(template, /t\('common\.actions\.cancel'\)/);
  assert.match(template, /field\('name'.*required=true/);
  assert.match(template, /textareaField\('description'.*required=true/);
  assert.match(template, /selectField\('currency'.*attrs='required'/);
  assert.doesNotMatch(template, /field\('unitPrice'.*required=true/);
  assert.doesNotMatch(template, /field\('taxRate'.*required=true/);
  assert.doesNotMatch(template, /Unit price is a reusable amount/);
});
