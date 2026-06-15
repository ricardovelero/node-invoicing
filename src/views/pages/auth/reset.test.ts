import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("reset password form posts with CSRF and required password field", () => {
  const template = readFileSync("src/views/pages/auth/reset.njk", "utf8");

  assert.match(template, /method="post" action="\/auth\/reset\/{{ token }}"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(
    template,
    /passwordField\('password', t\('auth\.fields\.newPassword'\), autocomplete='new-password', error=errors\.password, validate='password'\)/,
  );
  assert.match(template, /auth\.reset\.heading/);
  assert.match(template, /auth\.reset\.submit/);
});

test("reset password form renders field errors and invalid token state", () => {
  const template = readFileSync("src/views/pages/auth/reset.njk", "utf8");

  assert.match(template, /errors\.password/);
  assert.match(template, /auth\.reset\.invalidToken/);
  assert.match(template, /auth\.reset\.requestNewLink/);
  assert.match(template, /auth\.reset\.backToLogin/);
  assert.match(template, /href="\/auth\/forgot"/);
});
