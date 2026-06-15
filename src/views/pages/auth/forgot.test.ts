import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("forgot password form posts with CSRF and a validated email field", () => {
  const template = readFileSync("src/views/pages/auth/forgot.njk", "utf8");

  assert.match(template, /method="post" action="\/auth\/forgot"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /data-validate-form/);
  assert.match(template, /from "components\/form-field\.njk" import field/);
  assert.match(template, /field\('email', t\('auth\.fields\.email'\)/);
  assert.match(template, /validate='email'/);
  assert.match(template, /required=true/);
  assert.match(template, /auth\.forgot\.heading/);
  assert.match(template, /auth\.forgot\.submit/);
});

test("forgot password form renders field errors and generic success", () => {
  const template = readFileSync("src/views/pages/auth/forgot.njk", "utf8");

  assert.match(template, /error=errors\.email/);
  assert.match(template, /auth\.forgot\.success/);
  assert.match(template, /auth\.forgot\.switchPrompt/);
  assert.match(template, /auth\.forgot\.backToLogin/);
});
