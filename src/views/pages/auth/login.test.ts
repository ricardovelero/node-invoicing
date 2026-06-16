import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("login form posts with CSRF and a validated email field", () => {
  const template = readFileSync("src/views/pages/auth/login.njk", "utf8");

  assert.match(template, /method="post" action="\/auth\/login"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /data-validate-form/);
  assert.match(template, /from "components\/ui\/label-field\.njk" import labelField/);
  assert.match(template, /from "components\/ui\/input-field\.njk" import inputField/);
  assert.match(template, /from "components\/ui\/password-field\.njk" import passwordField/);
  assert.match(template, /labelField\('email', t\('auth\.fields\.email'\), required=true\)/);
  assert.match(template, /inputField\('email', type='email'/);
  assert.match(template, /validate='email'/);
  assert.match(template, /auth\.login\.heading/);
  assert.match(template, /auth\.login\.submit/);
});

test("login password keeps the forgot link and inline validation hooks", () => {
  const template = readFileSync("src/views/pages/auth/login.njk", "utf8");

  assert.match(template, /href="\/auth\/forgot"/);
  assert.match(
    template,
    /passwordField\('password', autocomplete='current-password', error=errors\.password, required=true, validate='password'\)/,
  );
  assert.match(template, /auth\.login\.forgotPassword/);
  assert.match(template, /auth\.login\.registerLink/);
});

test("login form renders server-side field errors", () => {
  const template = readFileSync("src/views/pages/auth/login.njk", "utf8");

  assert.match(template, /error=errors\.email/);
  assert.match(template, /errors\.password/);
});
