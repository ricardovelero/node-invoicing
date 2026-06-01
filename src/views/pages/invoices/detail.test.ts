import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const readTemplate = (fileName: string) =>
  readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", fileName),
    "utf8",
  );

test("invoice detail links to print page only for printable invoices", () => {
  const template = readTemplate("detail.njk");

  assert.match(template, /if invoiceDisplay\.isPrintable/);
  assert.match(template, /href="\/invoices\/{{ invoice\.id }}\/print"/);
  assert.match(template, /Print \/ Save as PDF/);
});

