import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney } from "./money";

test("formatMoney uses the provided currency and locale", () => {
  assert.equal(formatMoney(123456, "EUR", "es-ES"), "1234,56\u00a0€");
});

