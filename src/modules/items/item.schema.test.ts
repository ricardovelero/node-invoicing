import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatItemFormErrors,
  itemFormSchema,
  itemListQuerySchema,
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

  test("requires a catalog item description", () => {
    const result = itemFormSchema.safeParse({
      name: "Consulting",
      description: "",
      unitPrice: "",
      currency: "EUR",
      taxRate: "",
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.deepEqual(formatItemFormErrors(result.error), {
        description: ["Description is required."],
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

describe("itemListQuerySchema", () => {
  test("normalizes valid catalog item list query params", () => {
    const result = itemListQuerySchema.parse({
      page: "2",
      limit: "50",
      q: "  consult  ",
      archived: "1",
      sort: "name",
      direction: "asc",
    });

    assert.deepEqual(result, {
      page: 2,
      limit: 50,
      q: "consult",
      archived: "archived",
      sort: "name",
      direction: "asc",
    });
  });

  test("falls back to sensible defaults for invalid params", () => {
    const result = itemListQuerySchema.parse({
      page: "-2",
      limit: "20abc",
      q: 123,
      archived: "all",
      sort: "DROP TABLE",
      direction: "sideways",
    });

    assert.deepEqual(result, {
      page: 1,
      limit: 20,
      q: "",
      archived: "active",
      sort: "createdAt",
      direction: "desc",
    });
  });

  test("accepts only supported page sizes and sortable columns", () => {
    assert.equal(itemListQuerySchema.parse({ limit: "10" }).limit, 10);
    assert.equal(itemListQuerySchema.parse({ limit: "20" }).limit, 20);
    assert.equal(itemListQuerySchema.parse({ limit: "50" }).limit, 50);
    assert.equal(itemListQuerySchema.parse({ limit: "25" }).limit, 20);
    assert.equal(itemListQuerySchema.parse({ sort: "taxRateBps" }).sort, "taxRateBps");
    assert.equal(itemListQuerySchema.parse({ sort: "description" }).sort, "createdAt");
  });

  test("normalizes repeated query values from the first value", () => {
    const result = itemListQuerySchema.parse({
      page: ["3", "4"],
      archived: ["archived", "active"],
      direction: ["asc", "desc"],
    });

    assert.equal(result.page, 3);
    assert.equal(result.archived, "archived");
    assert.equal(result.direction, "asc");
  });
});
