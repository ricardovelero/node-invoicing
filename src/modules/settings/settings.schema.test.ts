import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  localizationSettingsSchema,
  organizationSettingsSchema,
} from "./settings.schema";

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
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.currency, [
      "Choose a supported currency.",
    ]);
  });

  test("rejects payment instructions over 2,000 characters", () => {
    const result = organizationSettingsSchema.safeParse({
      currency: "EUR",
      countryCode: "GB",
      paymentInstructions: "x".repeat(2001),
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.paymentInstructions, [
      "Payment instructions must be 2,000 characters or fewer.",
    ]);
  });
});

describe("localizationSettingsSchema", () => {
  test("accepts supported locales", () => {
    const result = localizationSettingsSchema.safeParse({ locale: "es-ES" });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, { locale: "es-ES" });
  });

  test("rejects unsupported locales", () => {
    const result = localizationSettingsSchema.safeParse({ locale: "fr-FR" });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.locale, [
      "Choose a supported locale.",
    ]);
  });
});
