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
  assert.match(source, /setCatalogSaveStatus\(input, 'hidden'\);\s*markUnsavedChangesDirty\(form\);/);
  assert.match(source, /linesContainer\.append\(line\);\s*markUnsavedChangesDirty\(form\);/);
  assert.match(source, /\.remove\(\);\s*markUnsavedChangesDirty\(form\);/);
  assert.match(source, /clearUnsavedChangesDirty\(panel\.closest\('form'\)\)/);
});

test("invoice frontend saves free-text line items to the catalog inline", () => {
  assert.match(source, /normalizeCatalogText/);
  assert.match(source, /shortCatalogName/);
  assert.match(source, /\.slice\(0, 80\)\.trim\(\)/);
  assert.match(source, /inputHasExactCatalogMatch/);
  assert.match(source, /itemName === value \|\| itemDescription === value/);
  assert.match(source, /savedCatalogDescriptions/);
  assert.match(source, /fetch\('\/items\/inline'/);
  assert.match(source, /_csrf: csrfInput\.value/);
  assert.match(source, /description: descriptionInput\.value/);
  assert.match(source, /unitPrice: unitPriceInput\?\.value \?\? '0'/);
  assert.match(source, /currency: currencySelect\.value/);
  assert.match(source, /taxRate: taxRateInput\?\.value \?\? '0'/);
  assert.match(source, /throw new Error\('Error saving new item'\)/);
  assert.match(source, /setCatalogSaveStatus\(descriptionInput, 'saved'\)/);
  assert.match(source, /setCatalogSaveStatus\(descriptionInput, 'error'\)/);
  assert.match(source, /catalogSaveHideTimeouts/);
  assert.match(source, /setCatalogSaveStatus\(input, 'hidden'\)/);
  assert.match(source, /}, 2000\)/);
  assert.match(source, /data-invoice-catalog-save-cancel/);
  assert.match(source, /setCatalogSaveStatus\(input, 'prompt'\)/);
  assert.match(source, /data-invoice-catalog-save-retry/);
});
