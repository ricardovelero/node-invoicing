import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const source = readFileSync(
  path.join(process.cwd(), "src", "public", "js", "invoices", "index.ts"),
  "utf8",
);
const catalogHelpersSource = readFileSync(
  path.join(process.cwd(), "src", "public", "js", "invoices", "catalog.helpers.ts"),
  "utf8",
);
const catalogSearchSource = readFileSync(
  path.join(process.cwd(), "src", "public", "js", "invoices", "catalog-search.ts"),
  "utf8",
);
const catalogSaveSource = readFileSync(
  path.join(process.cwd(), "src", "public", "js", "invoices", "catalog-save.ts"),
  "utf8",
);
const catalogTypesSource = readFileSync(
  path.join(process.cwd(), "src", "public", "js", "invoices", "catalog.types.ts"),
  "utf8",
);
const inlineEditorsSource = readFileSync(
  path.join(process.cwd(), "src", "public", "js", "inline-editors.ts"),
  "utf8",
);
const linesSource = readFileSync(
  path.join(process.cwd(), "src", "public", "js", "invoices", "lines.ts"),
  "utf8",
);
const totalsSource = readFileSync(
  path.join(process.cwd(), "src", "public", "js", "invoices", "totals.ts"),
  "utf8",
);

test("invoice frontend includes catalog autocomplete behavior", () => {
  assert.match(catalogSearchSource, /catalogSearchDebounceMs = 250/);
  assert.match(catalogSearchSource, /AbortController/);
  assert.match(catalogSearchSource, /\/items\/search/);
  assert.match(catalogSearchSource, /data-invoice-catalog-input/);
  assert.match(catalogSearchSource, /data-invoice-catalog-option/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /Escape/);
  assert.match(catalogSearchSource, /item\.description\?\.trim\(\) \|\| item\.name/);
  assert.match(catalogSearchSource, /item\.currency === currencySelect\.value/);
  assert.match(catalogSearchSource, /unitPriceInput\.value = ['"]{2}/);
  assert.match(catalogSearchSource, /unitPriceInput\.focus\(\)/);
});

test("invoice frontend marks custom invoice changes as dirty", () => {
  assert.match(source, /markUnsavedChangesDirty/);
  assert.match(catalogSearchSource, /setCatalogSaveStatus\(input, 'hidden'\);\s*markDirty\(\);/);
  assert.match(linesSource, /linesContainer\.append\(line\);\s*markDirty\(\);/);
  assert.match(source, /\.remove\(\);\s*markFormDirty\(\);/);
  assert.match(inlineEditorsSource, /clearUnsavedChangesDirty\(panel\.closest\('form'\)\)/);
});

test("invoice frontend saves free-text line items to the catalog inline", () => {
  assert.match(catalogHelpersSource, /normalizeCatalogText/);
  assert.match(catalogHelpersSource, /shortCatalogName/);
  assert.match(catalogHelpersSource, /\.slice\(0, 80\)\.trim\(\)/);
  assert.match(catalogTypesSource, /CatalogSaveStatus/);
  assert.match(totalsSource, /parseNumberInput/);
  assert.match(catalogSaveSource, /inputHasExactCatalogMatch/);
  assert.match(catalogSaveSource, /itemName === value \|\| itemDescription === value/);
  assert.match(catalogSaveSource, /lineHasEnteredUnitPrice/);
  assert.match(catalogSaveSource, /querySelector<HTMLInputElement>\(\s*'\[data-invoice-unit-price\]'/);
  assert.match(catalogSaveSource, /parseNumberInput\(unitPriceInput\) > 0/);
  assert.match(catalogSaveSource, /if \(!lineHasEnteredUnitPrice\(input\)\)/);
  assert.match(catalogSaveSource, /savedCatalogDescriptions/);
  assert.match(catalogSaveSource, /fetch\('\/items\/inline'/);
  assert.match(catalogSaveSource, /_csrf: csrfInput\.value/);
  assert.match(catalogSaveSource, /description: descriptionInput\.value/);
  assert.match(catalogSaveSource, /unitPrice: unitPriceInput\?\.value \?\? '0'/);
  assert.match(catalogSaveSource, /currency: context\.currencySelect\.value/);
  assert.match(catalogSaveSource, /taxRate: taxRateInput\?\.value \?\? '0'/);
  assert.match(catalogSaveSource, /throw new Error\('Error saving new item'\)/);
  assert.match(catalogSaveSource, /setCatalogSaveStatus\(descriptionInput, 'saved'/);
  assert.match(catalogSaveSource, /setCatalogSaveStatus\(descriptionInput, 'error'/);
  assert.match(catalogSaveSource, /catalogSaveHideTimeouts/);
  assert.match(catalogSaveSource, /setCatalogSaveStatus\(input, 'hidden'/);
  assert.match(catalogSaveSource, /}, 2000\)/);
  assert.match(source, /data-invoice-catalog-save-cancel/);
  assert.match(source, /event\.target\.matches\('\[data-invoice-unit-price\]'\)/);
  assert.match(source, /updateCatalogSavePromptForForm\(input\)/);
  assert.match(source, /data-invoice-catalog-save-retry/);
});
