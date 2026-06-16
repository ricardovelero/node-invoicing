import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("register form posts with CSRF and translated fields", () => {
  const template = readFileSync("src/views/pages/auth/register.njk", "utf8");

  assert.match(template, /method="post" action="\/auth\/register"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /data-validate-form/);
  assert.match(template, /auth\.register\.heading/);
  assert.match(template, /from "components\/ui\/label-field\.njk" import labelField/);
  assert.match(template, /from "components\/ui\/input-field\.njk" import inputField/);
  assert.match(template, /from "components\/ui\/password-field\.njk" import passwordField/);
  assert.match(template, /labelField\('name', t\('auth\.fields\.name'\)\)/);
  assert.match(template, /inputField\('name', value=values\.name, autocomplete='name'\)/);
  assert.match(template, /labelField\('email', t\('auth\.fields\.email'\), required=true\)/);
  assert.match(template, /inputField\('email', type='email'/);
  assert.match(
    template,
    /passwordField\('password', autocomplete='new-password'/,
  );
  assert.match(
    template,
    /labelField\('organizationName', t\('auth\.fields\.organization'\), required=true\)/,
  );
  assert.match(template, /inputField\('organizationName', value=values\.organizationName/);
  assert.match(template, /validateLabel=t\('auth\.fields\.organizationName'\)/);
});

test("register form uses translated submit and login copy", () => {
  const template = readFileSync("src/views/pages/auth/register.njk", "utf8");

  assert.match(template, /auth\.register\.submit/);
  assert.match(template, /auth\.register\.switchPrompt/);
  assert.match(template, /auth\.register\.loginLink/);
  assert.match(template, /href="\/auth\/login"/);
});
