import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { organizationSettingsSchema } from "./settings.schema";

describe("organizationSettingsSchema", () => {
  test("trims valid settings values", () => {
    const result = organizationSettingsSchema.safeParse({
      legalName: "  Analytical Engines Ltd  ",
      billingEmail: "  billing@example.com  ",
      taxId: "  VAT123  ",
      addressLine1: "  1 Example Street  ",
      city: "  London  ",
      countryCode: "  gb  ",
      currency: "GBP",
      locale: "es-ES",
      paymentInstructions: "  Pay by bank transfer.  ",
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
      legalName: "Analytical Engines Ltd",
      billingEmail: "billing@example.com",
      taxId: "VAT123",
      addressLine1: "1 Example Street",
      city: "London",
      countryCode: "GB",
      legalForm: "other",
      currency: "GBP",
      locale: "es-ES",
      withholdingEnabled: false,
      defaultWithholdingType: "",
      defaultWithholdingRateType: "15",
      defaultWithholdingRate: null,
      paymentInstructions: "Pay by bank transfer.",
    });
  });

  test("rejects invalid billing email", () => {
    const result = organizationSettingsSchema.safeParse({
      billingEmail: "not-an-email",
      countryCode: "GB",
      currency: "EUR",
      locale: "en-GB",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.billingEmail, [
      "Enter a valid billing email.",
    ]);
  });

  test("rejects unsupported currencies", () => {
    const result = organizationSettingsSchema.safeParse({
      currency: "JPY",
      countryCode: "GB",
      locale: "en-GB",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.currency, [
      "Choose a supported currency.",
    ]);
  });

  test("rejects unsupported locales", () => {
    const result = organizationSettingsSchema.safeParse({
      currency: "EUR",
      countryCode: "GB",
      locale: "fr-FR",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.locale, [
      "Choose a supported locale.",
    ]);
  });

  test("rejects payment instructions over 2,000 characters", () => {
    const result = organizationSettingsSchema.safeParse({
      currency: "EUR",
      countryCode: "GB",
      locale: "en-GB",
      paymentInstructions: "x".repeat(2001),
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.paymentInstructions, [
      "Payment instructions must be 2,000 characters or fewer.",
    ]);
  });
});
