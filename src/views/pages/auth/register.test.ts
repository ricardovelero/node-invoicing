import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("register form posts with CSRF and translated fields", () => {
  const template = readFileSync("src/views/pages/auth/register.njk", "utf8");

  assert.match(template, /method="post" action="\/auth\/register"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /data-validate-form/);
  assert.match(template, /auth\.register\.heading/);
  assert.match(template, /field\('name', t\('auth\.fields\.name'\)/);
  assert.match(template, /field\('email', t\('auth\.fields\.email'\)/);
  assert.match(
    template,
    /passwordField\('password', t\('auth\.fields\.password'\)/,
  );
  assert.match(
    template,
    /field\('organizationName', t\('auth\.fields\.organization'\)/,
  );
  assert.match(template, /validateLabel=t\('auth\.fields\.organizationName'\)/);
});

test("register form uses translated submit and login copy", () => {
  const template = readFileSync("src/views/pages/auth/register.njk", "utf8");

  assert.match(template, /auth\.register\.submit/);
  assert.match(template, /auth\.register\.switchPrompt/);
  assert.match(template, /auth\.register\.loginLink/);
  assert.match(template, /href="\/auth\/login"/);
});
