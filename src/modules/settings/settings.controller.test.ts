import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { createCurrencyOptions } from "../../lib/currencies";
import {
  createTranslator,
  loadTranslations,
  supportedLocales,
  type Translate,
} from "../../lib/i18n";
import * as authService from "../auth/auth.service";
import { encryptVerifactuCertificate } from "../verifactu/verifactu-certificate";
import {
  createOrganizationController,
  redirectGeneralSettings,
  redirectSecurityRateLimited,
  renderLocalizationSettings,
  renderNewOrganizationSettings,
  renderOrganizationSettings,
  renderOrganizationsSettings,
  renderProfileSettings,
  renderSecuritySettings,
  renderSettingsOverview,
  renderVerifactuSettings,
  removeVerifactuCertificateController,
  revokeOtherSessionsController,
  revokeSessionController,
  switchOrganizationController,
  updateLocalizationSettingsController,
  updateOrganizationSettingsController,
  updatePasswordController,
  updateProfileSettingsController,
  updateSecuritySettingsController,
  uploadVerifactuCertificateController,
} from "./settings.controller";

type MockRequest = Request & {
  body: Record<string, unknown>;
  params: Record<string, string>;
  auth: NonNullable<Request["auth"]>;
  session: {
    organizationId?: string;
    sessionIdleTimeoutMinutes?: number;
    sessionAbsoluteLifetimeDays?: number;
    cookie: {
      maxAge?: number;
    };
  };
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
  $transaction: unknown;
  organization: {
    update: unknown;
  };
  user: {
    findUnique: unknown;
    update: unknown;
  };
  organizationMembership: {
    findMany: unknown;
    findFirst: unknown;
  };
  session: {
    findMany: unknown;
    updateMany: unknown;
  };
};
const authServiceMock = authService as unknown as {
  changePassword: typeof authService.changePassword;
  recordAuthAuditEvent: typeof authService.recordAuthAuditEvent;
};

const originalTransaction = prismaMock.$transaction;
const originalUpdate = prismaMock.organization.update;
const originalUserFindUnique = prismaMock.user.findUnique;
const originalUserUpdate = prismaMock.user.update;
const originalMembershipFindMany = prismaMock.organizationMembership.findMany;
const originalMembershipFindFirst = prismaMock.organizationMembership.findFirst;
const originalSessionFindMany = prismaMock.session.findMany;
const originalSessionUpdateMany = prismaMock.session.updateMany;
const originalChangePassword = authServiceMock.changePassword;
const originalRecordAuthAuditEvent = authServiceMock.recordAuthAuditEvent;
const t = createTranslator("en-GB", loadTranslations(), {
  environment: "test",
});
let auditEvents: Array<Parameters<typeof authService.recordAuthAuditEvent>[0]> = [];

beforeEach(() => {
  auditEvents = [];
  prismaMock.organizationMembership.findMany = async () => [
    {
      role: "OWNER",
      createdAt: new Date("2026-06-01T10:00:00.000Z"),
      organization: {
        id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
        name: "Analytical Engines",
      },
    },
    {
      role: "ADMIN",
      createdAt: new Date("2026-06-02T10:00:00.000Z"),
      organization: {
        id: "6b2f4e3a-1234-4abc-8def-111111111111",
        name: "Difference Engines",
      },
    },
  ];
  prismaMock.session.findMany = async (
    args: { where?: { userId?: string } } = {},
  ) =>
    args.where?.userId === "user_empty"
      ? []
      : [
          {
            id: "sid_current",
            userAgent:
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            ip: "203.0.113.10",
            createdAt: new Date(Date.now() - 60 * 60 * 1000),
            lastSeenAt: new Date(Date.now() - 5 * 60 * 1000),
            expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            organization: { sessionIdleTimeoutMinutes: 24 * 60 },
          },
        ];
  authServiceMock.recordAuthAuditEvent = async (event) => {
    auditEvents.push(event);
    return { ok: true };
  };
  prismaMock.user.findUnique = async () => ({
    id: "user_1",
    email: "ada@example.com",
    name: "Ada Lovelace",
    fullName: "Augusta Ada Lovelace",
    timeZone: "Europe/London",
  });
});

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.organization.update = originalUpdate;
  prismaMock.user.findUnique = originalUserFindUnique;
  prismaMock.user.update = originalUserUpdate;
  prismaMock.organizationMembership.findMany = originalMembershipFindMany;
  prismaMock.organizationMembership.findFirst = originalMembershipFindFirst;
  prismaMock.session.findMany = originalSessionFindMany;
  prismaMock.session.updateMany = originalSessionUpdateMany;
  authServiceMock.changePassword = originalChangePassword;
  authServiceMock.recordAuthAuditEvent = originalRecordAuthAuditEvent;
});

const createRequest = (body: Record<string, unknown> = {}) =>
  ({
    body,
    params: {},
    auth: {
      user: {
        id: "user_1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        fullName: "Augusta Ada Lovelace",
        timeZone: "Europe/London",
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
    session: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      sessionIdleTimeoutMinutes: 45,
      sessionAbsoluteLifetimeDays: 21,
      cookie: {},
    },
    flashMessages: {},
    flash(type: string, message: string) {
      this.flashMessages[type] ??= [];
      this.flashMessages[type].push(message);
      return this.flashMessages[type];
    },
    sessionID: "sid_current",
    ip: "203.0.113.10",
    get(name: string) {
      return name.toLowerCase() === "user-agent" ? "Test Browser" : undefined;
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

test("redirectGeneralSettings keeps the legacy route compatible", () => {
  const req = createRequest();
  const res = createResponse();

  redirectGeneralSettings(req, res, () => undefined);

  assert.equal(res.redirectedTo, "/settings/profile");
});

test("redirectSecurityRateLimited flashes an error and returns to security settings", () => {
  const req = createRequest();
  const res = createResponse();

  redirectSecurityRateLimited(req, res, () => undefined);

  assert.deepEqual(req.flashMessages.error, [
    "Too many attempts. Please wait a moment and try again.",
  ]);
  assert.equal(res.redirectedTo, "/settings/security");
});

test("renderProfileSettings renders the current user profile", async () => {
  let findUniqueArgs: unknown;
  prismaMock.user.findUnique = async (args: unknown) => {
    findUniqueArgs = args;
    return {
      id: "user_1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      fullName: "Augusta Ada Lovelace",
      timeZone: "Europe/London",
    };
  };
  const req = createRequest();
  const res = createResponse();

  await renderProfileSettings(req, res, () => undefined);

  assert.deepEqual(findUniqueArgs, {
    where: { id: "user_1" },
    select: {
      id: true,
      email: true,
      name: true,
      fullName: true,
      timeZone: true,
    },
  });
  assert.equal(res.renderedView, "pages/settings/profile.njk");
  assert.deepEqual(res.renderedData, {
    title: "Profile",
    activeSettingsPage: "profile",
    values: {
      fullName: "Augusta Ada Lovelace",
      email: "ada@example.com",
      timeZone: "Europe/London",
    },
    errors: {},
    timeZoneOptions: [
      { value: "", label: "Application default" },
      { value: "UTC", label: "UTC" },
      { value: "Europe/Madrid", label: "Europe/Madrid" },
      { value: "Europe/London", label: "Europe/London" },
      { value: "Europe/Paris", label: "Europe/Paris" },
      { value: "America/New_York", label: "America/New_York" },
      { value: "America/Chicago", label: "America/Chicago" },
      { value: "America/Denver", label: "America/Denver" },
      { value: "America/Los_Angeles", label: "America/Los_Angeles" },
      { value: "America/Mexico_City", label: "America/Mexico_City" },
      { value: "America/Sao_Paulo", label: "America/Sao_Paulo" },
      { value: "Asia/Dubai", label: "Asia/Dubai" },
      { value: "Asia/Kolkata", label: "Asia/Kolkata" },
      { value: "Asia/Singapore", label: "Asia/Singapore" },
      { value: "Asia/Tokyo", label: "Asia/Tokyo" },
      { value: "Australia/Sydney", label: "Australia/Sydney" },
    ],
  });
});

test("updateProfileSettingsController returns field errors for invalid submissions", async () => {
  let updateCalls = 0;
  prismaMock.user.update = async () => {
    updateCalls += 1;
  };
  const req = createRequest({
    fullName: "",
    timeZone: "Mars/Olympus_Mons",
  });
  const res = createResponse();

  await updateProfileSettingsController(req, res, () => undefined);

  assert.equal(updateCalls, 0);
  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/settings/profile.njk");
  assert.deepEqual((res.renderedData as { values: unknown }).values, {
    fullName: "",
    email: "ada@example.com",
    timeZone: "Mars/Olympus_Mons",
  });
  assert.deepEqual((res.renderedData as { errors: unknown }).errors, {
    fullName: ["Enter your full name."],
    timeZone: ["Choose a supported time zone."],
  });
});

test("updateProfileSettingsController updates the current user and redirects", async () => {
  let updateArgs: unknown;
  prismaMock.user.update = async (args: unknown) => {
    updateArgs = args;
    return {
      id: "user_1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      fullName: "Augusta Ada Lovelace",
      timeZone: null,
    };
  };
  const req = createRequest({
    fullName: "  Augusta Ada Lovelace  ",
    timeZone: "",
  });
  const res = createResponse();

  await updateProfileSettingsController(req, res, () => undefined);

  assert.deepEqual(updateArgs, {
    where: { id: "user_1" },
    data: {
      fullName: "Augusta Ada Lovelace",
      timeZone: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      fullName: true,
      timeZone: true,
    },
  });
  assert.deepEqual(req.flashMessages.success, ["Profile updated successfully."]);
  assert.equal(res.redirectedTo, "/settings/profile");
});

test("renderSecuritySettings renders its page with the active tab", async () => {
  const req = createRequest();
  const res = createResponse();

  await renderSecuritySettings(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/settings/security.njk");
  assert.equal(
    (res.renderedData as { activeSettingsPage: string }).activeSettingsPage,
    "security",
  );
});

test("renderOrganizationsSettings renders memberships and marks the current organization", async () => {
  const req = createRequest();
  const res = createResponse();

  await renderOrganizationsSettings(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/settings/organizations.njk");
  assert.deepEqual(res.renderedData, {
    title: "Organisations",
    activeSettingsPage: "organizations",
    currentOrganization: req.auth.organization,
    memberships: [
      {
        organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
        organizationName: "Analytical Engines",
        role: "OWNER",
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        isCurrent: true,
      },
      {
        organizationId: "6b2f4e3a-1234-4abc-8def-111111111111",
        organizationName: "Difference Engines",
        role: "ADMIN",
        createdAt: new Date("2026-06-02T10:00:00.000Z"),
        isCurrent: false,
      },
    ],
  });
});

test("createOrganizationController returns field errors for invalid submissions", async () => {
  let transactionCalls = 0;
  prismaMock.$transaction = async () => {
    transactionCalls += 1;
  };
  const req = createRequest({
    legalName: "",
    countryCode: "GB",
    currency: "EUR",
  });
  const res = createResponse();

  await createOrganizationController(req, res, () => undefined);

  assert.equal(transactionCalls, 0);
  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/settings/organization-new.njk");
  assert.equal(
    (res.renderedData as { formAction: string }).formAction,
    "/settings/organizations",
  );
  assert.equal(
    (res.renderedData as { cancelHref: string }).cancelHref,
    "/settings/organizations",
  );
  assert.deepEqual((res.renderedData as { errors: unknown }).errors, {
    legalName: ["Enter the legal name."],
  });
});

test("createOrganizationController creates without switching session and redirects", async () => {
  let createdOrganizationData: unknown;
  let createdMembershipData: unknown;
  prismaMock.$transaction = async (
    callback: (tx: {
      organization: {
        create: (args: unknown) => Promise<{
          id: string;
        }>;
      };
      organizationMembership: {
        create: (args: unknown) => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      organization: {
        async create(args) {
          createdOrganizationData = args;
          return {
            id: "33333333-3333-3333-3333-333333333333",
          };
        },
      },
      organizationMembership: {
        async create(args) {
          createdMembershipData = args;
          return {};
        },
      },
    });
  const req = createRequest({
    legalName: " New Organisation Ltd ",
    billingEmail: " billing@example.com ",
    taxId: " VAT456 ",
    addressLine1: " 2 Example Street ",
    city: " Manchester ",
    countryCode: " gb ",
    legalForm: "company",
    currency: "GBP",
    paymentInstructions: " Pay on receipt. ",
  });
  const res = createResponse();

  await createOrganizationController(req, res, () => undefined);

  assert.deepEqual(createdOrganizationData, {
    data: {
      name: "New Organisation Ltd",
      legalName: "New Organisation Ltd",
      billingEmail: "billing@example.com",
      taxId: "VAT456",
      addressLine1: "2 Example Street",
      city: "Manchester",
      countryCode: "GB",
      legalForm: "company",
      fiscalRegime: "VERIFACTU",
      currency: "GBP",
      withholdingEnabled: false,
      defaultWithholdingType: null,
      defaultWithholdingRate: null,
      paymentInstructions: "Pay on receipt.",
    },
    select: {
      id: true,
    },
  });
  assert.deepEqual(createdMembershipData, {
    data: {
      userId: "user_1",
      organizationId: "33333333-3333-3333-3333-333333333333",
      role: "OWNER",
    },
  });
  assert.equal(req.session.organizationId, "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab");
  assert.equal(req.session.sessionIdleTimeoutMinutes, 45);
  assert.equal(req.session.sessionAbsoluteLifetimeDays, 21);
  assert.equal(req.session.cookie.maxAge, undefined);
  assert.deepEqual(req.flashMessages.success, [
    "Organisation created. You can switch to it from the organisation selector.",
  ]);
  assert.equal(res.redirectedTo, "/settings/organizations");
});

test("switchOrganizationController switches only to user memberships", async () => {
  let findFirstArgs: unknown;
  prismaMock.organizationMembership.findFirst = async (args: unknown) => {
    findFirstArgs = args;
    return {
      organization: {
        id: "6b2f4e3a-1234-4abc-8def-111111111111",
        sessionIdleTimeoutMinutes: 45,
        sessionAbsoluteLifetimeDays: 21,
      },
    };
  };
  const req = createRequest({
    organizationId: "6b2f4e3a-1234-4abc-8def-111111111111",
    returnTo: "/invoices",
  });
  const res = createResponse();

  await switchOrganizationController(req, res, () => undefined);

  assert.deepEqual(findFirstArgs, {
    where: {
      userId: "user_1",
      organizationId: "6b2f4e3a-1234-4abc-8def-111111111111",
    },
    include: {
      organization: {
        select: {
          id: true,
          sessionIdleTimeoutMinutes: true,
          sessionAbsoluteLifetimeDays: true,
        },
      },
    },
  });
  assert.equal(req.session.organizationId, "6b2f4e3a-1234-4abc-8def-111111111111");
  assert.equal(req.session.sessionIdleTimeoutMinutes, 45);
  assert.equal(req.session.sessionAbsoluteLifetimeDays, 21);
  assert.deepEqual(req.flashMessages.success, ["Organisation switched."]);
  assert.equal(res.redirectedTo, "/invoices");
});

test("switchOrganizationController rejects unauthorized switches", async () => {
  prismaMock.organizationMembership.findFirst = async () => null;
  const req = createRequest({
    organizationId: "8c3f5a4b-5678-4abc-8def-222222222222",
    returnTo: "//evil.example",
  });
  const res = createResponse();

  await switchOrganizationController(req, res, () => undefined);

  assert.equal(req.session.organizationId, "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab");
  assert.equal(req.session.sessionIdleTimeoutMinutes, 45);
  assert.equal(req.session.sessionAbsoluteLifetimeDays, 21);
  assert.deepEqual(req.flashMessages.error, ["Organisation could not be switched."]);
  assert.equal(res.redirectedTo, "/");
});

test("switchOrganizationController ignores returnTo values browsers resolve off-site", async () => {
  for (const returnTo of ["/\\evil.example", "/\t/evil.example", "https://evil.example"]) {
    const req = createRequest({ organizationId: "not-a-uuid", returnTo });
    const res = createResponse();

    await switchOrganizationController(req, res, () => undefined);

    assert.equal(res.redirectedTo, "/", returnTo);
  }
});

test("renderOrganizationSettings renders current organization values", () => {
  const req = createRequest();
  const res = createResponse();

  renderOrganizationSettings(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/settings/organization.njk");
  assert.deepEqual(res.renderedData, {
    title: "Organisation settings",
    heading: "Organisation settings",
    description: "Legal details, billing, and invoicing defaults for your organisation.",
    activeSettingsPage: "organization",
    formAction: "/settings/organization",
    submitLabel: "Save settings",
    cancelHref: "/settings",
    mode: "edit",
    values: {
      legalName: "Analytical Engines Ltd",
      billingEmail: "billing@example.com",
      taxId: "VAT123",
      addressLine1: "1 Example Street",
      city: "London",
      countryCode: "GB",
      legalForm: "company",
      fiscalRegime: "VERIFACTU",
      currency: "GBP",
      withholdingEnabled: "",
      defaultWithholdingType: "",
      defaultWithholdingRateType: "15",
      defaultWithholdingRate: "15",
      paymentInstructions: "Pay by bank transfer.",
    },
    withholdingEligible: false,
    withholdingRateOptions: [],
    withholdingRateTypeOptions: [{ value: "custom", label: "Custom" }],
    countryOptions: [
      { value: "ES", label: "Spain" },
      { value: "GB", label: "United Kingdom" },
      { value: "US", label: "United States of America" },
    ],
    currencyOptions: createCurrencyOptions(),
    legalFormOptions: [
      { value: "sole_trader", label: "Sole trader" },
      { value: "company", label: "Company" },
      { value: "other", label: "Other" },
    ],
    fiscalRegimeOptions: [
      { value: "VERIFACTU", label: "Veri*Factu" },
      { value: "SII", label: "SII (Immediate Supply of Information)" },
      { value: "FORAL", label: "Basque Country or Navarra (not supported)" },
    ],
    errors: {},
  });
});

test("renderNewOrganizationSettings renders a dedicated create form", () => {
  const req = createRequest();
  const res = createResponse();

  renderNewOrganizationSettings(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/settings/organization-new.njk");
  assert.deepEqual(
    {
      title: (res.renderedData as { title: string }).title,
      heading: (res.renderedData as { heading: string }).heading,
      description: (res.renderedData as { description: string }).description,
      activeSettingsPage: (res.renderedData as { activeSettingsPage: string }).activeSettingsPage,
      formAction: (res.renderedData as { formAction: string }).formAction,
      submitLabel: (res.renderedData as { submitLabel: string }).submitLabel,
      cancelHref: (res.renderedData as { cancelHref: string }).cancelHref,
      mode: (res.renderedData as { mode: string }).mode,
    },
    {
      title: "New organisation",
      heading: "New organisation",
      description:
        "Create a separate organisation with its own legal details, billing defaults, customers, items, invoices, and numbering.",
      activeSettingsPage: "organizations",
      formAction: "/settings/organizations",
      submitLabel: "Create organisation",
      cancelHref: "/settings/organizations",
      mode: "create",
    },
  );
  assert.deepEqual((res.renderedData as { errors: unknown }).errors, {});
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
    withholdingRateOptions: unknown;
    withholdingRateTypeOptions: unknown;
  };

  assert.equal(data.withholdingEligible, true);
  assert.equal(data.values.withholdingEnabled, "on");
  assert.equal(data.values.defaultWithholdingType, "IRPF");
  assert.equal(data.values.defaultWithholdingRateType, "custom");
  assert.equal(data.values.defaultWithholdingRate, "12.5");
  assert.deepEqual(data.withholdingRateOptions, [
    { value: "15", label: "15%" },
    { value: "7", label: "7%" },
  ]);
  assert.deepEqual(data.withholdingRateTypeOptions, [
    { value: "15", label: "15%" },
    { value: "7", label: "7%" },
    { value: "custom", label: "Custom" },
  ]);
});

test("updateOrganizationSettingsController returns field errors for invalid submissions", async () => {
  let updateCalls = 0;
  prismaMock.organization.update = async () => {
    updateCalls += 1;
  };
  const req = createRequest({
    legalName: "Analytical Engines Ltd",
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
      name: "Analytical Engines Ltd",
      legalName: "Analytical Engines Ltd",
      billingEmail: "billing@example.com",
      taxId: "VAT123",
      addressLine1: "1 Example Street",
      city: "London",
      countryCode: "GB",
      legalForm: "other",
      fiscalRegime: "VERIFACTU",
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
    legalName: "Analytical Engines Ltd",
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
    localeOptions: supportedLocales,
    errors: {},
  });
});

test("renderSecuritySettings renders current session timeout values and active sessions", async () => {
  const req = createRequest();
  const res = createResponse();

  await renderSecuritySettings(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/settings/security.njk");
  assert.deepEqual((res.renderedData as { values: unknown }).values, {
    sessionIdleTimeoutMinutes: "45",
    sessionAbsoluteLifetimeDays: "21",
  });
  assert.deepEqual((res.renderedData as { errors: unknown }).errors, {});
  assert.deepEqual((res.renderedData as { passwordErrors: unknown }).passwordErrors, {});
  assert.equal((res.renderedData as { title: string }).title, "Security settings");
  assert.equal(
    (res.renderedData as { activeSettingsPage: string }).activeSettingsPage,
    "security",
  );
  assert.deepEqual(
    (res.renderedData as { sessions: Array<{ id: string; isCurrent: boolean; browserDevice: string; ip: string }> }).sessions.map((session) => ({
      id: session.id,
      isCurrent: session.isCurrent,
      browserDevice: session.browserDevice,
      ip: session.ip,
    })),
    [
      {
        id: "sid_current",
        isCurrent: true,
        browserDevice: "Chrome on macOS",
        ip: "203.0.113.10",
      },
    ],
  );
  assert.deepEqual(
    Object.keys((res.renderedData as { sessions: Array<Record<string, unknown>> }).sessions[0]),
    [
      "id",
      "isCurrent",
      "browserDevice",
      "ip",
      "createdAt",
      "lastSeenAt",
      "expiresAt",
      "createdAtDisplay",
      "createdAtIso",
      "expiresAtDisplay",
      "expiresAtIso",
      "lastSeenAtDisplay",
      "lastSeenAtIso",
    ],
  );
});

test("renderSecuritySettings passes an empty active sessions list", async () => {
  const req = createRequest();
  req.auth.user.id = "user_empty";
  const res = createResponse();

  await renderSecuritySettings(req, res, () => undefined);

  assert.deepEqual(res.renderedData, {
    title: "Security settings",
    activeSettingsPage: "security",
    values: {
      sessionIdleTimeoutMinutes: "45",
      sessionAbsoluteLifetimeDays: "21",
    },
    errors: {},
    passwordErrors: {},
    sessions: [],
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
  assert.deepEqual(
    (res.renderedData as { values: unknown }).values,
    {
      sessionIdleTimeoutMinutes: "4",
      sessionAbsoluteLifetimeDays: "91",
    },
  );
  assert.equal(
    (res.renderedData as { sessions: unknown[] }).sessions.length,
    1,
  );
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

test("updatePasswordController validates without rendering password values back", async () => {
  let serviceCalls = 0;
  authServiceMock.changePassword = async () => {
    serviceCalls += 1;
    return { ok: true };
  };
  const req = createRequest({
    currentPassword: "CorrectPassword1",
    newPassword: "NewPassword1",
    confirmPassword: "DifferentPassword1",
  });
  const res = createResponse();

  await updatePasswordController(req, res, () => undefined);

  assert.equal(serviceCalls, 0);
  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/settings/security.njk");
  assert.deepEqual((res.renderedData as { passwordErrors: unknown }).passwordErrors, {
    confirmPassword: ["New password and confirmation must match."],
  });
  assert.equal(JSON.stringify(res.renderedData).includes("CorrectPassword1"), false);
  assert.equal(JSON.stringify(res.renderedData).includes("NewPassword1"), false);
});

test("updatePasswordController renders current password errors", async () => {
  authServiceMock.changePassword = async () => ({
    ok: false,
    reason: "invalidCurrentPassword",
  });
  const req = createRequest({
    currentPassword: "WrongPassword1",
    newPassword: "NewPassword1",
    confirmPassword: "NewPassword1",
  });
  const res = createResponse();

  await updatePasswordController(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/settings/security.njk");
  assert.deepEqual((res.renderedData as { passwordErrors: unknown }).passwordErrors, {
    currentPassword: ["Current password is incorrect."],
  });
});

test("updatePasswordController changes the password and redirects", async () => {
  let serviceData: unknown;
  authServiceMock.changePassword = async (data) => {
    serviceData = data;
    return { ok: true };
  };
  const req = createRequest({
    currentPassword: "CorrectPassword1",
    newPassword: "NewPassword1",
    confirmPassword: "NewPassword1",
  });
  const res = createResponse();

  await updatePasswordController(req, res, () => undefined);

  assert.deepEqual(serviceData, {
    userId: "user_1",
    currentPassword: "CorrectPassword1",
    newPassword: "NewPassword1",
    currentSessionId: "sid_current",
  });
  assert.deepEqual(req.flashMessages.success, ["Password changed successfully."]);
  assert.equal(res.redirectedTo, "/settings/security");
  assert.deepEqual(auditEvents, [
    {
      type: "PASSWORD_CHANGED",
      userId: "user_1",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      ip: "203.0.113.10",
      userAgent: "Test Browser",
      sessionId: "sid_current",
    },
  ]);
});

test("revokeSessionController revokes a selected session and redirects", async () => {
  let updateArgs: unknown;
  prismaMock.session.updateMany = async (args: unknown) => {
    updateArgs = args;
    return { count: 1 };
  };
  const req = createRequest();
  req.params.sessionId = "sid_other";
  const res = createResponse();

  await revokeSessionController(req, res, () => undefined);

  assert.deepEqual((updateArgs as { where: unknown }).where, {
    id: "sid_other",
    userId: "user_1",
    revokedAt: null,
  });
  assert.deepEqual(req.flashMessages.success, ["Session revoked."]);
  assert.equal(res.redirectedTo, "/settings/security");
  assert.deepEqual(auditEvents, [
    {
      type: "SESSION_REVOKED",
      userId: "user_1",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      ip: "203.0.113.10",
      userAgent: "Test Browser",
      sessionId: "sid_current",
      metadata: {
        targetSessionId: "sid_other",
      },
    },
  ]);
});

test("revokeSessionController refuses to revoke the current session", async () => {
  let updateCalls = 0;
  prismaMock.session.updateMany = async () => {
    updateCalls += 1;
    return { count: 1 };
  };
  const req = createRequest();
  req.params.sessionId = "sid_current";
  const res = createResponse();

  await revokeSessionController(req, res, () => undefined);

  assert.equal(updateCalls, 0);
  assert.deepEqual(req.flashMessages.error, ["Session could not be revoked."]);
  assert.equal(res.redirectedTo, "/settings/security");
  assert.deepEqual(auditEvents, []);
});

test("revokeOtherSessionsController revokes all other sessions and redirects", async () => {
  let updateArgs: unknown;
  prismaMock.session.updateMany = async (args: unknown) => {
    updateArgs = args;
    return { count: 2 };
  };
  const req = createRequest();
  const res = createResponse();

  await revokeOtherSessionsController(req, res, () => undefined);

  assert.deepEqual((updateArgs as { where: unknown }).where, {
    userId: "user_1",
    revokedAt: null,
    id: {
      not: "sid_current",
    },
  });
  assert.deepEqual(req.flashMessages.success, ["2 other sessions revoked."]);
  assert.equal(res.redirectedTo, "/settings/security");
  assert.deepEqual(auditEvents, [
    {
      type: "SESSION_REVOKED",
      userId: "user_1",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      ip: "203.0.113.10",
      userAgent: "Test Browser",
      sessionId: "sid_current",
      metadata: {
        scope: "otherSessions",
        revokedCount: 2,
      },
    },
  ]);
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

const verifactuCertificateMock = (prisma as unknown as {
  verifactuCertificate: Record<string, unknown>;
}).verifactuCertificate;
const certificateFixture = (name: string) => readFileSync(
  path.join(process.cwd(), "src", "modules", "verifactu", "fixtures", `${name}.p12`),
);

const withVerifactuCertificateMock = async (
  methods: Record<string, unknown>,
  run: () => Promise<void>,
) => {
  const originals = Object.fromEntries(
    Object.keys(methods).map((name) => [name, verifactuCertificateMock[name]]),
  );
  const originalKey = process.env.VERIFACTU_CERT_ENCRYPTION_KEY;

  Object.assign(verifactuCertificateMock, methods);
  process.env.VERIFACTU_CERT_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");

  try {
    await run();
  } finally {
    Object.assign(verifactuCertificateMock, originals);
    process.env.VERIFACTU_CERT_ENCRYPTION_KEY = originalKey;
  }
};

const certificateUpload = (name: string) => ({
  name: `${name}.p12`,
  type: "application/x-pkcs12",
  data: certificateFixture(name),
});

test("uploadVerifactuCertificateController stores a valid certificate encrypted", async () => {
  let upsertArgs: { where: unknown; create: Record<string, unknown> } | undefined;

  await withVerifactuCertificateMock({
    async upsert(args: { where: unknown; create: Record<string, unknown> }) {
      upsertArgs = args;
      return {};
    },
  }, async () => {
    const req = createRequest({
      certificate: certificateUpload("representative"),
      certificatePassword: "test-password",
    });
    const res = createResponse();

    await uploadVerifactuCertificateController(req, res, () => undefined);

    assert.equal(res.redirectedTo, "/settings/verifactu");
    assert.deepEqual(req.flashMessages.success, ["Certificate saved."]);
    assert.deepEqual(upsertArgs!.where, {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    });
    assert.equal(upsertArgs!.create.holderNif, "B12345674");
    assert.equal(upsertArgs!.create.isSeal, false);
    assert.ok(Buffer.isBuffer(upsertArgs!.create.encryptedPayload));
    assert.equal(
      (upsertArgs!.create.encryptedPayload as Buffer).includes("test-password"),
      false,
    );
  });
});

test("uploadVerifactuCertificateController shows field errors without saving", async () => {
  let upsertCalls = 0;

  await withVerifactuCertificateMock({
    async upsert() {
      upsertCalls += 1;
    },
    async findUnique() {
      return null;
    },
  }, async () => {
    const cases = [
      {
        body: { certificatePassword: "test-password" },
        errors: { certificate: ["Choose a .p12 or .pfx certificate file."] },
      },
      {
        body: { certificate: certificateUpload("personal"), certificatePassword: "" },
        errors: { certificatePassword: ["Enter the certificate password."] },
      },
      {
        body: { certificate: certificateUpload("personal"), certificatePassword: "wrong" },
        errors: { certificatePassword: ["The password isn't correct for this certificate."] },
      },
      {
        body: {
          certificate: certificateUpload("legacy-rc2"),
          certificatePassword: "test-password",
        },
        errors: {
          certificate: [
            "This file uses old encryption that isn't supported. " +
              "Export it again with AES-256 or TripleDES encryption.",
          ],
        },
      },
    ];

    for (const { body, errors } of cases) {
      const req = createRequest(body);
      const res = createResponse();

      await uploadVerifactuCertificateController(req, res, () => undefined);

      const data = res.renderedData as { errors: Record<string, string[] | undefined> };

      assert.equal(res.statusCode, 422);
      assert.equal(res.renderedView, "pages/settings/verifactu.njk");
      assert.deepEqual(
        Object.fromEntries(Object.entries(data.errors).filter(([, value]) => value)),
        errors,
      );
    }
  });

  assert.equal(upsertCalls, 0);
});

const storedCertificate = (encryptedPayload: Buffer) => ({
  holderName: "EMPRESA PRUEBA SL",
  holderNif: "B12345674",
  isSeal: true,
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validTo: new Date("2099-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-03T00:00:00.000Z"),
  encryptedPayload,
});

test("renderVerifactuSettings warns when the certificate NIF differs", async () => {
  await withVerifactuCertificateMock({
    async findUnique() {
      return storedCertificate(encryptVerifactuCertificate(
        "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
        { pfx: certificateFixture("seal"), passphrase: "test-password" },
      ));
    },
  }, async () => {
    const req = createRequest();
    const res = createResponse();

    req.auth.organization = {
      ...req.auth.organization,
      countryCode: "ES",
      fiscalRegime: "VERIFACTU",
      taxId: "ESB87654323",
    };

    await renderVerifactuSettings(req, res, () => undefined);

    const data = res.renderedData as Record<string, unknown>;

    assert.equal(data.usesVerifactu, true);
    assert.equal(data.certificateExpired, false);
    assert.equal(data.certificateUnreadable, false);
    assert.equal(
      data.nifMismatchMessage,
      "The certificate's NIF (B12345674) doesn't match the organisation's NIF " +
        "(ESB87654323). AEAT only accepts submissions if the holder can file on the " +
        "organisation's behalf.",
    );
  });
});

test("renderVerifactuSettings warns when the server key cannot read the certificate", async () => {
  const otherKeyPayload = encryptVerifactuCertificate(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    { pfx: certificateFixture("seal"), passphrase: "test-password" },
    { VERIFACTU_CERT_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") },
  );

  await withVerifactuCertificateMock({
    async findUnique() {
      return storedCertificate(otherKeyPayload);
    },
  }, async () => {
    const req = createRequest();
    const res = createResponse();

    await renderVerifactuSettings(req, res, () => undefined);

    assert.equal((res.renderedData as Record<string, unknown>).certificateUnreadable, true);
  });
});

test("removeVerifactuCertificateController deletes the organization certificate", async () => {
  let deleteArgs: unknown;

  await withVerifactuCertificateMock({
    async deleteMany(args: unknown) {
      deleteArgs = args;
      return { count: 1 };
    },
  }, async () => {
    const req = createRequest();
    const res = createResponse();

    await removeVerifactuCertificateController(req, res, () => undefined);

    assert.deepEqual(deleteArgs, {
      where: { organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab" },
    });
    assert.equal(res.redirectedTo, "/settings/verifactu");
    assert.deepEqual(req.flashMessages.success, ["Certificate removed."]);
  });
});
