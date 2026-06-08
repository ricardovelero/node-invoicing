import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { createTranslator, loadTranslations, type Translate } from "../../lib/i18n";
import {
  renderOrganizationSettings,
  updateOrganizationSettingsController,
} from "./settings.controller";

type MockRequest = Request & {
  body: Record<string, unknown>;
  auth: NonNullable<Request["auth"]>;
  flashMessages: Record<string, string[]>;
  t: Translate;
};

type MockResponse = Response & {
  statusCode?: number;
  redirectedTo?: string;
  renderedView?: string;
  renderedData?: unknown;
};

const prismaMock = prisma as unknown as {
  organization: {
    update: unknown;
  };
};

const originalUpdate = prismaMock.organization.update;
const t = createTranslator("en-GB", loadTranslations(), {
  environment: "test",
});

afterEach(() => {
  prismaMock.organization.update = originalUpdate;
});

const createRequest = (body: Record<string, unknown> = {}) =>
  ({
    body,
    auth: {
      user: {
        id: "user_1",
        email: "ada@example.com",
        name: "Ada Lovelace",
      },
      organization: {
        id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
        name: "Analytical Engines",
        legalName: "Analytical Engines Ltd",
        billingEmail: "billing@example.com",
        taxId: "VAT123",
        addressLine1: "1 Example Street",
        city: "London",
        country: "United Kingdom",
        currency: "GBP",
        locale: "es-ES",
        paymentInstructions: "Pay by bank transfer.",
      },
      role: "OWNER",
    },
    flashMessages: {},
    flash(type: string, message: string) {
      this.flashMessages[type] ??= [];
      this.flashMessages[type].push(message);
      return this.flashMessages[type];
    },
    t,
  }) as MockRequest;

const createResponse = () => {
  const res: {
    statusCode?: number;
    redirectedTo?: string;
    renderedView?: string;
    renderedData?: unknown;
    status?: (statusCode: number) => MockResponse;
    redirect?: (path: string) => MockResponse;
    render?: (view: string, data: unknown) => MockResponse;
  } = {};

  res.status = (statusCode: number) => {
    res.statusCode = statusCode;
    return res as unknown as MockResponse;
  };
  res.redirect = (path: string) => {
    res.redirectedTo = path;
    return res as unknown as MockResponse;
  };
  res.render = (view: string, data: unknown) => {
    res.renderedView = view;
    res.renderedData = data;
    return res as unknown as MockResponse;
  };

  return res as unknown as MockResponse;
};

test("renderOrganizationSettings renders current organization values", () => {
  const req = createRequest();
  const res = createResponse();

  renderOrganizationSettings(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/settings/form.njk");
  assert.deepEqual(res.renderedData, {
    title: "Organisation settings",
    values: {
      legalName: "Analytical Engines Ltd",
      billingEmail: "billing@example.com",
      taxId: "VAT123",
      addressLine1: "1 Example Street",
      city: "London",
      country: "United Kingdom",
      currency: "GBP",
      locale: "es-ES",
      paymentInstructions: "Pay by bank transfer.",
    },
    errors: {},
  });
});

test("updateOrganizationSettingsController returns field errors for invalid submissions", async () => {
  let updateCalls = 0;
  prismaMock.organization.update = async () => {
    updateCalls += 1;
  };
  const req = createRequest({
    currency: "JPY",
    locale: "fr-FR",
    billingEmail: "not-an-email",
    paymentInstructions: "x".repeat(2001),
  });
  const res = createResponse();

  await updateOrganizationSettingsController(req, res, () => undefined);

  assert.equal(updateCalls, 0);
  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/settings/form.njk");
  assert.deepEqual((res.renderedData as { errors: unknown }).errors, {
    billingEmail: ["Enter a valid billing email."],
    currency: ["Choose a supported currency."],
    locale: ["Choose a supported locale."],
    paymentInstructions: ["Payment instructions must be 2,000 characters or fewer."],
  });
});

test("updateOrganizationSettingsController updates settings and redirects", async () => {
  let updateArgs: unknown;
  prismaMock.organization.update = async (args: unknown) => {
    updateArgs = args;
    return { id: "org_1" };
  };
  const req = createRequest({
    legalName: "  Analytical Engines Ltd  ",
    billingEmail: "  billing@example.com  ",
    taxId: "  VAT123  ",
    addressLine1: "  1 Example Street  ",
    city: "  London  ",
    country: "  United Kingdom  ",
    currency: "GBP",
    locale: "es-ES",
    paymentInstructions: "  Pay by bank transfer.  ",
  });
  const res = createResponse();

  await updateOrganizationSettingsController(req, res, () => undefined);

  assert.deepEqual(updateArgs, {
    where: { id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab" },
    data: {
      legalName: "Analytical Engines Ltd",
      billingEmail: "billing@example.com",
      taxId: "VAT123",
      addressLine1: "1 Example Street",
      city: "London",
      country: "United Kingdom",
      currency: "GBP",
      locale: "es-ES",
      paymentInstructions: "Pay by bank transfer.",
    },
  });
  assert.deepEqual(req.flashMessages.success, ["Organisation settings updated."]);
  assert.equal(res.redirectedTo, "/settings");
});
