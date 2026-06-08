import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("reset password form posts with CSRF and required password field", () => {
  const template = readFileSync("src/views/pages/auth/reset.njk", "utf8");

  assert.match(template, /method="post" action="\/auth\/reset\/{{ token }}"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /New password <span class="text-red-600">\*<\/span>/);
  assert.match(template, /name="password" type="password"/);
  assert.match(template, /autocomplete="new-password"/);
  assert.match(template, /data-password-toggle/);
});

test("reset password form renders field errors and invalid token state", () => {
  const template = readFileSync("src/views/pages/auth/reset.njk", "utf8");

  assert.match(template, /errors\.password/);
  assert.match(template, /This password reset link is invalid or has expired/);
  assert.match(template, /href="\/auth\/forgot"/);
});
