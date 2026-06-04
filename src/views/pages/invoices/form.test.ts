import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const template = readFileSync(
  path.join(process.cwd(), "src", "views", "pages", "invoices", "form.njk"),
  "utf8",
);

test("invoice form includes payment instructions and internal notes fields", () => {
  assert.match(template, /name="paymentInstructions"/);
  assert.match(template, /values\.paymentInstructions/);
  assert.match(template, /errors\.paymentInstructions/);
  assert.match(template, /name="notes"/);
  assert.match(template, /Internal notes for your team/);
  assert.match(template, /errors\.notes/);
});
