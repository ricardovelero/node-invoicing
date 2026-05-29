import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import { updateOrganizationSettings } from "./settings.service";

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
    taxId: "",
    addressLine1: "1 Example Street",
    city: "",
    country: "United Kingdom",
    currency: "GBP",
    paymentInstructions: "",
  });

  assert.deepEqual(organization, { id: "org_1" });
  assert.deepEqual(updateArgs, {
    where: { id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab" },
    data: {
      legalName: "Analytical Engines Ltd",
      taxId: null,
      addressLine1: "1 Example Street",
      city: null,
      country: "United Kingdom",
      currency: "GBP",
      paymentInstructions: null,
    },
  });
});
