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
