import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { createTranslator, loadTranslations, type Translate } from "../../lib/i18n";
import {
  renderGeneralSettings,
  renderLocalizationSettings,
  renderOrganizationSettings,
  renderOrganizationsSettings,
  renderSecuritySettings,
  renderSettingsOverview,
  updateLocalizationSettingsController,
  updateOrganizationSettingsController,
  updateSecuritySettingsController,
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
        countryCode: "GB",
        legalForm: "company",
        currency: "GBP",
        locale: "es-ES",
        paymentInstructions: "Pay by bank transfer.",
        sessionIdleTimeoutMinutes: 45,
        sessionAbsoluteLifetimeDays: 21,
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

test("renderSettingsOverview renders the settings overview", () => {
  const req = createRequest();
  const res = createResponse();

  renderSettingsOverview(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/settings/index.njk");
  assert.deepEqual(res.renderedData, {
    title: "Settings",
    activeSettingsPage: "overview",
  });
});

test("placeholder sections render their pages with the active tab", () => {
  const cases = [
    {
      handler: renderGeneralSettings,
      view: "pages/settings/general.njk",
      activeSettingsPage: "general",
    },
    {
      handler: renderSecuritySettings,
      view: "pages/settings/security.njk",
      activeSettingsPage: "security",
    },
    {
      handler: renderOrganizationsSettings,
      view: "pages/settings/organizations.njk",
      activeSettingsPage: "organizations",
    },
  ];

  for (const testCase of cases) {
    const req = createRequest();
    const res = createResponse();

    testCase.handler(req, res, () => undefined);

    assert.equal(res.renderedView, testCase.view);
    assert.equal(
      (res.renderedData as { activeSettingsPage: string }).activeSettingsPage,
      testCase.activeSettingsPage,
    );
  }
});

test("renderOrganizationSettings renders current organization values", () => {
  const req = createRequest();
  const res = createResponse();

  renderOrganizationSettings(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/settings/organization.njk");
  assert.deepEqual(res.renderedData, {
    title: "Organisation settings",
    activeSettingsPage: "organization",
    values: {
      legalName: "Analytical Engines Ltd",
      billingEmail: "billing@example.com",
      taxId: "VAT123",
      addressLine1: "1 Example Street",
      city: "London",
      countryCode: "GB",
      legalForm: "company",
      currency: "GBP",
      withholdingEnabled: "",
      defaultWithholdingType: "",
      defaultWithholdingRateType: "15",
      defaultWithholdingRate: "15",
      paymentInstructions: "Pay by bank transfer.",
    },
    withholdingEligible: false,
    withholdingRateOptions: [],
    errors: {},
  });
});

test("renderOrganizationSettings preserves stored custom withholding rate values", () => {
  const req = createRequest();
  req.auth.organization.countryCode = "ES";
  req.auth.organization.legalForm = "sole_trader";
  req.auth.organization.withholdingEnabled = true;
  req.auth.organization.defaultWithholdingType = "IRPF";
  req.auth.organization.defaultWithholdingRate = { toString: () => "12.5" } as never;
  const res = createResponse();

  renderOrganizationSettings(req, res, () => undefined);

  const data = res.renderedData as {
    values: {
      withholdingEnabled: string;
      defaultWithholdingType: string;
      defaultWithholdingRateType: string;
      defaultWithholdingRate: string;
    };
    withholdingEligible: boolean;
  };

  assert.equal(data.withholdingEligible, true);
  assert.equal(data.values.withholdingEnabled, "on");
  assert.equal(data.values.defaultWithholdingType, "IRPF");
  assert.equal(data.values.defaultWithholdingRateType, "custom");
  assert.equal(data.values.defaultWithholdingRate, "12.5");
});

test("updateOrganizationSettingsController returns field errors for invalid submissions", async () => {
  let updateCalls = 0;
  prismaMock.organization.update = async () => {
    updateCalls += 1;
  };
  const req = createRequest({
    currency: "JPY",
    countryCode: "GB",
    billingEmail: "not-an-email",
    paymentInstructions: "x".repeat(2001),
  });
  const res = createResponse();

  await updateOrganizationSettingsController(req, res, () => undefined);

  assert.equal(updateCalls, 0);
  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/settings/organization.njk");
  assert.deepEqual((res.renderedData as { errors: unknown }).errors, {
    billingEmail: ["Enter a valid billing email."],
    currency: ["Choose a supported currency."],
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
    countryCode: "  gb  ",
    currency: "GBP",
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
      countryCode: "GB",
      legalForm: "other",
      currency: "GBP",
      withholdingEnabled: false,
      defaultWithholdingType: null,
      defaultWithholdingRate: null,
      paymentInstructions: "Pay by bank transfer.",
    },
  });
  assert.deepEqual(req.flashMessages.success, ["Organisation settings updated."]);
  assert.equal(res.redirectedTo, "/settings/organization");
});

test("updateOrganizationSettingsController keeps the custom rate type selected when the rate is missing", async () => {
  let updateCalls = 0;
  prismaMock.organization.update = async () => {
    updateCalls += 1;
  };
  const req = createRequest({
    countryCode: "ES",
    legalForm: "sole_trader",
    currency: "EUR",
    withholdingEnabled: "on",
    defaultWithholdingType: "IRPF",
    defaultWithholdingRateType: "custom",
    defaultWithholdingRate: "",
  });
  const res = createResponse();

  await updateOrganizationSettingsController(req, res, () => undefined);

  assert.equal(updateCalls, 0);
  assert.equal(res.statusCode, 422);

  const data = res.renderedData as {
    values: { defaultWithholdingRateType: string; defaultWithholdingRate: string };
    errors: Record<string, string[]>;
  };

  assert.equal(data.values.defaultWithholdingRateType, "custom");
  assert.equal(data.values.defaultWithholdingRate, "");
  assert.deepEqual(data.errors.defaultWithholdingRate, ["Enter a withholding rate."]);
});

test("renderLocalizationSettings renders the current locale", () => {
  const req = createRequest();
  const res = createResponse();

  renderLocalizationSettings(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/settings/localization.njk");
  assert.deepEqual(res.renderedData, {
    title: "Localisation settings",
    activeSettingsPage: "localization",
    values: { locale: "es-ES" },
    errors: {},
  });
});

test("renderSecuritySettings renders current session timeout values", () => {
  const req = createRequest();
  const res = createResponse();

  renderSecuritySettings(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/settings/security.njk");
  assert.deepEqual(res.renderedData, {
    title: "Security settings",
    activeSettingsPage: "security",
    values: {
      sessionIdleTimeoutMinutes: "45",
      sessionAbsoluteLifetimeDays: "21",
    },
    errors: {},
  });
});

test("updateSecuritySettingsController returns field errors for invalid submissions", async () => {
  let updateCalls = 0;
  prismaMock.organization.update = async () => {
    updateCalls += 1;
  };
  const req = createRequest({
    sessionIdleTimeoutMinutes: "4",
    sessionAbsoluteLifetimeDays: "91",
  });
  const res = createResponse();

  await updateSecuritySettingsController(req, res, () => undefined);

  assert.equal(updateCalls, 0);
  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/settings/security.njk");
  assert.deepEqual((res.renderedData as { errors: unknown }).errors, {
    sessionIdleTimeoutMinutes: ["Idle timeout must be at least 5 minutes."],
    sessionAbsoluteLifetimeDays: [
      "Absolute session lifetime must be 90 days or fewer.",
    ],
  });
});

test("updateSecuritySettingsController updates timeout settings and redirects", async () => {
  let updateArgs: unknown;
  prismaMock.organization.update = async (args: unknown) => {
    updateArgs = args;
    return { id: "org_1" };
  };
  const req = createRequest({
    sessionIdleTimeoutMinutes: "30",
    sessionAbsoluteLifetimeDays: "14",
  });
  const res = createResponse();

  await updateSecuritySettingsController(req, res, () => undefined);

  assert.deepEqual(updateArgs, {
    where: { id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab" },
    data: {
      sessionIdleTimeoutMinutes: 30,
      sessionAbsoluteLifetimeDays: 14,
    },
  });
  assert.deepEqual(req.flashMessages.success, ["Security settings updated."]);
  assert.equal(res.redirectedTo, "/settings/security");
});

test("updateLocalizationSettingsController returns field errors for invalid submissions", async () => {
  let updateCalls = 0;
  prismaMock.organization.update = async () => {
    updateCalls += 1;
  };
  const req = createRequest({ locale: "fr-FR" });
  const res = createResponse();

  await updateLocalizationSettingsController(req, res, () => undefined);

  assert.equal(updateCalls, 0);
  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/settings/localization.njk");
  assert.deepEqual((res.renderedData as { errors: unknown }).errors, {
    locale: ["Choose a supported locale."],
  });
});

test("updateLocalizationSettingsController updates the locale and redirects", async () => {
  let updateArgs: unknown;
  prismaMock.organization.update = async (args: unknown) => {
    updateArgs = args;
    return { id: "org_1" };
  };
  const req = createRequest({ locale: "en-US" });
  const res = createResponse();

  await updateLocalizationSettingsController(req, res, () => undefined);

  assert.deepEqual(updateArgs, {
    where: { id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab" },
    data: { locale: "en-US" },
  });
  assert.deepEqual(req.flashMessages.success, ["Localisation settings updated."]);
  assert.equal(res.redirectedTo, "/settings/localization");
});
