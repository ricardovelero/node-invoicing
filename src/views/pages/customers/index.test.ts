import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("customer index links customer names to detail pages", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "customers", "index.njk"),
    "utf8",
  );

  assert.match(template, /href="\/customers\/{{ customer\.id }}"/);
});

test("customer index includes active and archived customer toggles", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "customers", "index.njk"),
    "utf8",
  );

  assert.match(template, /href="\/customers\?archived=1"/);
  assert.match(template, /href="\/customers"/);
  assert.match(template, /t\('customers\.actions\.archived'\)/);
  assert.match(template, /t\('customers\.archivedTitle'\)/);
  assert.match(template, /customer\.archivedAt/);
});
