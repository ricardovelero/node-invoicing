import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import {
  updateLocalizationSettings,
  updateOrganizationSettings,
} from "./settings.service";

const prismaMock = prisma as unknown as {
  organization: {
    update: unknown;
  };
};

const originalUpdate = prismaMock.organization.update;

afterEach(() => {
  prismaMock.organization.update = originalUpdate;
});

test("updateOrganizationSettings updates the current organization and stores empty fields as null", async () => {
  let updateArgs: unknown;

  prismaMock.organization.update = async (args: unknown) => {
    updateArgs = args;
    return { id: "org_1" };
  };

  const organization = await updateOrganizationSettings("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    legalName: "Analytical Engines Ltd",
    billingEmail: "",
    taxId: "",
    addressLine1: "1 Example Street",
    city: "",
    countryCode: "GB",
    legalForm: "company",
    currency: "GBP",
    withholdingEnabled: true,
    defaultWithholdingType: "IRPF",
    defaultWithholdingRateType: "15",
    defaultWithholdingRate: 15,
    paymentInstructions: "",
  });

  assert.deepEqual(organization, { id: "org_1" });
  assert.deepEqual(updateArgs, {
    where: { id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab" },
    data: {
      legalName: "Analytical Engines Ltd",
      billingEmail: null,
      taxId: null,
      addressLine1: "1 Example Street",
      city: null,
      countryCode: "GB",
      legalForm: "company",
      currency: "GBP",
      withholdingEnabled: false,
      defaultWithholdingType: null,
      defaultWithholdingRate: null,
      paymentInstructions: null,
    },
  });
});

test("updateOrganizationSettings allows Spanish sole traders to enable IRPF withholding", async () => {
  let updateArgs: unknown;

  prismaMock.organization.update = async (args: unknown) => {
    updateArgs = args;
    return { id: "org_1" };
  };

  await updateOrganizationSettings("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    legalName: "",
    billingEmail: "",
    taxId: "",
    addressLine1: "",
    city: "",
    countryCode: "ES",
    legalForm: "sole_trader",
    currency: "EUR",
    withholdingEnabled: true,
    defaultWithholdingType: "IRPF",
    defaultWithholdingRateType: "15",
    defaultWithholdingRate: 15,
    paymentInstructions: "",
  });

  assert.deepEqual((updateArgs as { data: unknown }).data, {
    legalName: null,
    billingEmail: null,
    taxId: null,
    addressLine1: null,
    city: null,
    countryCode: "ES",
    legalForm: "sole_trader",
    currency: "EUR",
    withholdingEnabled: true,
    defaultWithholdingType: "IRPF",
    defaultWithholdingRate: 15,
    paymentInstructions: null,
  });
});

test("updateOrganizationSettings forces IRPF off for Spanish companies and non-Spanish organizations", async () => {
  const cases = [
    { countryCode: "ES" as const, legalForm: "company" as const },
    { countryCode: "US" as const, legalForm: "sole_trader" as const },
  ];

  for (const testCase of cases) {
    let updateArgs: unknown;

    prismaMock.organization.update = async (args: unknown) => {
      updateArgs = args;
      return { id: "org_1" };
    };

    await updateOrganizationSettings("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
      legalName: "",
      billingEmail: "",
      taxId: "",
      addressLine1: "",
      city: "",
      countryCode: testCase.countryCode,
      legalForm: testCase.legalForm,
      currency: "EUR",
      withholdingEnabled: true,
      defaultWithholdingType: "IRPF",
      defaultWithholdingRateType: "15",
      defaultWithholdingRate: 15,
      paymentInstructions: "",
    });

    assert.equal((updateArgs as { data: { withholdingEnabled: boolean } }).data.withholdingEnabled, false);
    assert.equal((updateArgs as { data: { defaultWithholdingType: string | null } }).data.defaultWithholdingType, null);
    assert.equal((updateArgs as { data: { defaultWithholdingRate: number | null } }).data.defaultWithholdingRate, null);
  }
});

test("updateLocalizationSettings updates only the organization locale", async () => {
  let updateArgs: unknown;

  prismaMock.organization.update = async (args: unknown) => {
    updateArgs = args;
    return { id: "org_1" };
  };

  const organization = await updateLocalizationSettings(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    { locale: "en-US" },
  );

  assert.deepEqual(organization, { id: "org_1" });
  assert.deepEqual(updateArgs, {
    where: { id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab" },
    data: { locale: "en-US" },
  });
});
