import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  createCurrencyOptions,
  defaultCurrency,
  supportedCurrencies,
} from "./currencies";

const source = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("currency configuration exposes the shared default, supported list, and options", () => {
  assert.equal(defaultCurrency, "EUR");
  assert.deepEqual(supportedCurrencies, ["EUR", "USD", "GBP", "CAD", "AUD"]);
  assert.deepEqual(createCurrencyOptions(), [
    { value: "EUR", label: "EUR" },
    { value: "USD", label: "USD" },
    { value: "GBP", label: "GBP" },
    { value: "CAD", label: "CAD" },
    { value: "AUD", label: "AUD" },
  ]);
});

test("currency consumers import the shared currency source", () => {
  assert.match(source("src/lib/money.ts"), /from ['"]\.\/currencies['"]/);
  assert.match(
    source("src/modules/settings/settings.schema.ts"),
    /from ['"]\.\.\/\.\.\/lib\/currencies['"]/,
  );
  assert.match(
    source("src/modules/items/item.schema.ts"),
    /from ['"]\.\.\/\.\.\/lib\/currencies['"]/,
  );
  assert.match(
    source("src/modules/invoices/invoice.schema.ts"),
    /from ['"]\.\.\/\.\.\/lib\/currencies['"]/,
  );
  assert.match(
    source("src/modules/settings/settings.controller.ts"),
    /createCurrencyOptions/,
  );
  assert.match(
    source("src/modules/invoices/invoice.presenter.ts"),
    /createCurrencyOptions/,
  );
  assert.match(
    source("src/public/js/invoices/index.ts"),
    /from ['"]\.\.\/\.\.\/\.\.\/lib\/currencies['"]/,
  );
  assert.match(
    source("src/public/js/invoices/totals.ts"),
    /from ['"]\.\.\/\.\.\/\.\.\/lib\/currencies['"]/,
  );
});
