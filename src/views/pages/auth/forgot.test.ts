import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("forgot password form posts with CSRF and a validated email field", () => {
  const template = readFileSync("src/views/pages/auth/forgot.njk", "utf8");

  assert.match(template, /method="post" action="\/auth\/forgot"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /data-validate-form/);
  assert.match(template, /from "components\/form-field\.njk" import field/);
  assert.match(template, /field\('email', 'Email'/);
  assert.match(template, /validate='email'/);
  assert.match(template, /required=true/);
});

test("forgot password form renders field errors and generic success", () => {
  const template = readFileSync("src/views/pages/auth/forgot.njk", "utf8");

  assert.match(template, /error=errors\.email/);
  assert.match(template, /If an account exists for that email/);
});
