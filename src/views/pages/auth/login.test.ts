import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("login form posts with CSRF and a validated email field", () => {
  const template = readFileSync("src/views/pages/auth/login.njk", "utf8");

  assert.match(template, /method="post" action="\/auth\/login"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /data-validate-form/);
  assert.match(template, /from "components\/form-field\.njk" import field/);
  assert.match(template, /field\('email', 'Email'/);
  assert.match(template, /validate='email'/);
});

test("login password keeps the forgot link and inline validation hooks", () => {
  const template = readFileSync("src/views/pages/auth/login.njk", "utf8");

  assert.match(template, /href="\/auth\/forgot"/);
  assert.match(
    template,
    /passwordField\('password', 'Password', autocomplete='current-password', error=errors\.password, validate='password'\)/,
  );
});

test("login form renders server-side field errors", () => {
  const template = readFileSync("src/views/pages/auth/login.njk", "utf8");

  assert.match(template, /error=errors\.email/);
  assert.match(template, /errors\.password/);
});
