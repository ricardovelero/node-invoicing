import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("password reset email templates include the reset link", () => {
  const htmlTemplate = readFileSync(
    "src/views/emails/auth/password-reset-html.njk",
    "utf8",
  );
  const textTemplate = readFileSync(
    "src/views/emails/auth/password-reset-text.njk",
    "utf8",
  );

  assert.match(htmlTemplate, /href="{{ resetUrl }}"/);
  assert.match(htmlTemplate, /This link expires in 1 hour/);
  assert.match(textTemplate, /{{ resetUrl }}/);
  assert.match(textTemplate, /This link expires in 1 hour/);
});
