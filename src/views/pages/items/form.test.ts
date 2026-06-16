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
  assert.match(template, /from "components\/ui\/label-field\.njk" import labelField/);
  assert.match(template, /from "components\/ui\/input-field\.njk" import inputField/);
  assert.match(template, /from "components\/ui\/select-field\.njk" import selectField/);
  assert.match(template, /from "components\/ui\/textarea-field\.njk" import textareaField/);
  assert.doesNotMatch(template, /from "components\/form-field\.njk"/);
  assert.match(template, /labelField\('name'[\s\S]*?required=true/);
  assert.match(template, /inputField\('name'[\s\S]*?required=true/);
  assert.match(template, /labelField\('description'[\s\S]*?required=true/);
  assert.match(template, /textareaField\('description'[\s\S]*?required=true/);
  assert.match(template, /inputField\('unitPrice'/);
  assert.match(template, /selectField\('currency'/);
  assert.match(template, /inputField\('taxRate'/);
  assert.match(template, /{{ submitLabel or t\('items\.actions\.create'\) }}/);
  assert.match(template, /href="{{ cancelHref or '\/items' }}"/);
  assert.match(template, /t\('items\.form\.fields\.unitPrice'\)/);
  assert.match(template, /t\('common\.actions\.cancel'\)/);
  assert.doesNotMatch(template, /labelField\('unitPrice'[\s\S]*?required=true/);
  assert.doesNotMatch(template, /inputField\('unitPrice'[\s\S]*?required=true/);
  assert.doesNotMatch(template, /labelField\('taxRate'[\s\S]*?required=true/);
  assert.doesNotMatch(template, /inputField\('taxRate'[\s\S]*?required=true/);
  assert.doesNotMatch(template, /Unit price is a reusable amount/);
});
