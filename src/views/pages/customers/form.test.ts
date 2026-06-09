import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("customer form includes csrf and configurable edit fields", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "customers", "form.njk"),
    "utf8",
  );

  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /action="{{ formAction or '\/customers' }}"/);
  assert.match(template, /data-unsaved-changes-guard/);
  assert.match(template, /t\('customers\.section'\)/);
  assert.match(template, /t\('customers\.form\.fields\.name'\)/);
  assert.match(template, /t\('customers\.form\.fields\.email'\)/);
  assert.match(template, /t\('customers\.form\.fields\.taxId'\)/);
  assert.match(template, /{{ submitLabel or t\('customers\.actions\.create'\) }}/);
  assert.match(template, /t\('common\.actions\.cancel'\)/);
  assert.match(template, /href="{{ cancelHref or '\/customers' }}"/);
});
