import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { createTranslator, loadTranslations, type Translate } from "../../lib/i18n";
import * as authService from "../auth/auth.service";
import {
  createOrganizationController,
  renderGeneralSettings,
  renderLocalizationSettings,
  renderOrganizationSettings,
  renderOrganizationsSettings,
  renderSecuritySettings,
  renderSettingsOverview,
  revokeOtherSessionsController,
  revokeSessionController,
  switchOrganizationController,
  updateLocalizationSettingsController,
  updateOrganizationSettingsController,
  updatePasswordController,
  updateSecuritySettingsController,
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
});

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.organization.update = originalUpdate;
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

test("placeholder sections render their pages with the active tab", async () => {
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
  ];

  for (const testCase of cases) {
    const req = createRequest();
    const res = createResponse();

    await Promise.resolve(testCase.handler(req, res, () => undefined));

    assert.equal(res.renderedView, testCase.view);
    assert.equal(
      (res.renderedData as { activeSettingsPage: string }).activeSettingsPage,
      testCase.activeSettingsPage,
    );
  }
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
    values: {},
    errors: {},
  });
});

test("createOrganizationController returns field errors for invalid submissions", async () => {
  let transactionCalls = 0;
  prismaMock.$transaction = async () => {
    transactionCalls += 1;
  };
  const req = createRequest({ name: "" });
  const res = createResponse();

  await createOrganizationController(req, res, () => undefined);

  assert.equal(transactionCalls, 0);
  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/settings/organizations.njk");
  assert.deepEqual((res.renderedData as { values: unknown }).values, {
    name: "",
  });
  assert.deepEqual((res.renderedData as { errors: unknown }).errors, {
    name: ["Enter an organization name."],
  });
});

test("createOrganizationController creates, switches session, and redirects", async () => {
  let createdOrganizationData: unknown;
  let createdMembershipData: unknown;
  prismaMock.$transaction = async (
    callback: (tx: {
      organization: {
        create: (args: unknown) => Promise<{
          id: string;
          sessionIdleTimeoutMinutes: number;
          sessionAbsoluteLifetimeDays: number;
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
            sessionIdleTimeoutMinutes: 30,
            sessionAbsoluteLifetimeDays: 14,
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
  const req = createRequest({ name: " New Organisation " });
  const res = createResponse();

  await createOrganizationController(req, res, () => undefined);

  assert.deepEqual(createdOrganizationData, {
    data: {
      name: "New Organisation",
      legalName: "New Organisation",
    },
    select: {
      id: true,
      sessionIdleTimeoutMinutes: true,
      sessionAbsoluteLifetimeDays: true,
    },
  });
  assert.deepEqual(createdMembershipData, {
    data: {
      userId: "user_1",
      organizationId: "33333333-3333-3333-3333-333333333333",
      role: "OWNER",
    },
  });
  assert.equal(req.session.organizationId, "33333333-3333-3333-3333-333333333333");
  assert.equal(req.session.sessionIdleTimeoutMinutes, 30);
  assert.equal(req.session.sessionAbsoluteLifetimeDays, 14);
  assert.equal(req.session.cookie.maxAge, 14 * 24 * 60 * 60 * 1000);
  assert.deepEqual(req.flashMessages.success, ["Organisation created."]);
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
    withholdingRateTypeOptions: [{ value: "custom", label: "Custom" }],
    countryOptions: [
      { value: "ES", label: "Spain" },
      { value: "GB", label: "United Kingdom" },
      { value: "US", label: "United States of America" },
    ],
    currencyOptions: [
      { value: "EUR", label: "EUR" },
      { value: "USD", label: "USD" },
      { value: "GBP", label: "GBP" },
      { value: "CAD", label: "CAD" },
      { value: "AUD", label: "AUD" },
    ],
    legalFormOptions: [
      { value: "sole_trader", label: "Sole trader" },
      { value: "company", label: "Company" },
      { value: "other", label: "Other" },
    ],
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
