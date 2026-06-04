import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatItemFormErrors,
  itemFormSchema,
  normalizeItemFormValues,
} from "./item.schema";

describe("itemFormSchema", () => {
  test("trims valid catalog item values", () => {
    const result = itemFormSchema.safeParse({
      name: "  Strategy session  ",
      description: "  Workshop package  ",
      unitPrice: "125.50",
      currency: "GBP",
      taxRate: "21",
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
      name: "Strategy session",
      description: "Workshop package",
      unitPrice: 125.5,
      currency: "GBP",
      taxRate: 21,
    });
  });

  test("rejects invalid catalog item values", () => {
    const result = itemFormSchema.safeParse({
      name: "",
      description: "A".repeat(2001),
      unitPrice: "-1",
      currency: "JPY",
      taxRate: "101",
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.deepEqual(formatItemFormErrors(result.error), {
        name: ["Item name is required."],
        description: ["Description must be 2,000 characters or fewer."],
        unitPrice: ["Unit price cannot be negative."],
        currency: ["Choose a supported currency."],
        taxRate: ["Tax rate cannot exceed 100%."],
      });
    }
  });
});

test("normalizeItemFormValues preserves submitted form strings", () => {
  assert.deepEqual(
    normalizeItemFormValues({
      name: "Consulting",
      description: "Advice",
      unitPrice: "99.99",
      currency: "USD",
      taxRate: "8.25",
    }),
    {
      name: "Consulting",
      description: "Advice",
      unitPrice: "99.99",
      currency: "USD",
      taxRate: "8.25",
    },
  );
});
