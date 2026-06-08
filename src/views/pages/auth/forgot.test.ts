import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("forgot password form posts with CSRF and required email field", () => {
  const template = readFileSync("src/views/pages/auth/forgot.njk", "utf8");

  assert.match(template, /method="post" action="\/auth\/forgot"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /Email <span class="text-red-600">\*<\/span>/);
  assert.match(template, /name="email" type="email"/);
  assert.match(template, /required/);
});

test("forgot password form renders field errors and generic success", () => {
  const template = readFileSync("src/views/pages/auth/forgot.njk", "utf8");

  assert.match(template, /errors\.email/);
  assert.match(template, /If an account exists for that email/);
});
