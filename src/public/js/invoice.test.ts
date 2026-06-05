import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const source = readFileSync(
  path.join(process.cwd(), "src", "public", "js", "invoice.ts"),
  "utf8",
);

test("invoice frontend includes catalog autocomplete behavior", () => {
  assert.match(source, /catalogSearchDebounceMs = 250/);
  assert.match(source, /AbortController/);
  assert.match(source, /\/items\/search/);
  assert.match(source, /data-invoice-catalog-input/);
  assert.match(source, /data-invoice-catalog-option/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /Escape/);
  assert.match(source, /item\.description\?\.trim\(\) \|\| item\.name/);
  assert.match(source, /item\.currency === currencySelect\.value/);
  assert.match(source, /unitPriceInput\.value = ['"]{2}/);
  assert.match(source, /unitPriceInput\.focus\(\)/);
});

test("invoice frontend marks custom invoice changes as dirty", () => {
  assert.match(source, /markUnsavedChangesDirty/);
  assert.match(source, /hideCatalogSuggestions\(input\);\s*markUnsavedChangesDirty\(form\);/);
  assert.match(source, /linesContainer\.append\(line\);\s*markUnsavedChangesDirty\(form\);/);
  assert.match(source, /\.remove\(\);\s*markUnsavedChangesDirty\(form\);/);
  assert.match(source, /clearUnsavedChangesDirty\(panel\.closest\('form'\)\)/);
});
