import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("customer detail profile card links to edit customer", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "customers", "detail.njk"),
    "utf8",
  );

  assert.match(template, /href="\/customers\/{{ customer\.id }}\/edit"/);
  assert.match(template, /aria-label="Edit customer"/);
});

test("customer detail actions include a primary edit customer button", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "customers", "detail.njk"),
    "utf8",
  );

  assert.match(template, /href="\/customers\/{{ customer\.id }}\/edit">Edit customer<\/a>/);
  assert.match(template, /bg-action px-4 py-2 text-sm font-semibold text-white/);
});

test("customer detail includes archive delete and restore action forms", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "customers", "detail.njk"),
    "utf8",
  );

  assert.match(template, /action="\/customers\/{{ customer\.id }}\/delete"/);
  assert.match(template, /action="\/customers\/{{ customer\.id }}\/archive"/);
  assert.match(template, /action="\/customers\/{{ customer\.id }}\/restore"/);
  assert.match(template, /customer\.invoices\.length == 0/);
  assert.match(template, /elif not customer\.archivedAt/);
  assert.match(template, /if customer\.archivedAt/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
});

test("customer detail visibly indicates archived customers", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "customers", "detail.njk"),
    "utf8",
  );

  assert.match(template, /Archived/);
  assert.match(template, /{{ customer\.archivedAt \| date }}/);
});
