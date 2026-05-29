import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("invoice index links invoice numbers to detail pages", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", "index.njk"),
    "utf8",
  );

  assert.match(template, /href="\/invoices\/{{ invoice\.id }}"/);
});
