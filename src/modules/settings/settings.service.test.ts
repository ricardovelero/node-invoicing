import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import {
  getActiveSessionsForUser,
  revokeOtherSessionsForUser,
  revokeSessionForUser,
  updateLocalizationSettings,
  updateOrganizationSettings,
  updateSecuritySettings,
} from "./settings.service";

const prismaMock = prisma as unknown as {
  organization: {
    update: unknown;
  };
  session: {
    findMany: unknown;
    updateMany: unknown;
  };
};

const originalUpdate = prismaMock.organization.update;
const originalSessionFindMany = prismaMock.session.findMany;
const originalSessionUpdateMany = prismaMock.session.updateMany;

afterEach(() => {
  prismaMock.organization.update = originalUpdate;
  prismaMock.session.findMany = originalSessionFindMany;
  prismaMock.session.updateMany = originalSessionUpdateMany;
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

test("updateSecuritySettings updates only session timeout fields", async () => {
  let updateArgs: unknown;

  prismaMock.organization.update = async (args: unknown) => {
    updateArgs = args;
    return { id: "org_1" };
  };

  const organization = await updateSecuritySettings(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    {
      sessionIdleTimeoutMinutes: 30,
      sessionAbsoluteLifetimeDays: 14,
    },
  );

  assert.deepEqual(organization, { id: "org_1" });
  assert.deepEqual(updateArgs, {
    where: { id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab" },
    data: {
      sessionIdleTimeoutMinutes: 30,
      sessionAbsoluteLifetimeDays: 14,
    },
  });
});

test("getActiveSessionsForUser returns current session first and filters idle-expired sessions", async () => {
  const now = new Date("2026-06-11T12:00:00.000Z");
  let findArgs: unknown;

  prismaMock.session.findMany = async (args: unknown) => {
    findArgs = args;
    return [
      {
        id: "sid_other",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
        ip: "203.0.113.20",
        createdAt: new Date("2026-06-10T09:00:00.000Z"),
        lastSeenAt: new Date("2026-06-11T11:45:00.000Z"),
        expiresAt: new Date("2026-06-25T09:00:00.000Z"),
        organization: { sessionIdleTimeoutMinutes: 30 },
      },
      {
        id: "sid_current",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        ip: "203.0.113.10",
        createdAt: new Date("2026-06-11T09:00:00.000Z"),
        lastSeenAt: new Date("2026-06-11T11:50:00.000Z"),
        expiresAt: new Date("2026-06-25T09:00:00.000Z"),
        organization: { sessionIdleTimeoutMinutes: 30 },
      },
      {
        id: "sid_idle",
        userAgent: null,
        ip: null,
        createdAt: new Date("2026-06-11T08:00:00.000Z"),
        lastSeenAt: new Date("2026-06-11T11:00:00.000Z"),
        expiresAt: new Date("2026-06-25T08:00:00.000Z"),
        organization: { sessionIdleTimeoutMinutes: 30 },
      },
    ];
  };

  const sessions = await getActiveSessionsForUser("user_1", "sid_current", now);

  assert.deepEqual(findArgs, {
    where: {
      userId: "user_1",
      revokedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    select: {
      id: true,
      userAgent: true,
      ip: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      organization: {
        select: {
          sessionIdleTimeoutMinutes: true,
        },
      },
    },
    orderBy: {
      lastSeenAt: "desc",
    },
  });
  assert.deepEqual(
    sessions.map((session) => ({
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
      {
        id: "sid_other",
        isCurrent: false,
        browserDevice: "Firefox on Windows",
        ip: "203.0.113.20",
      },
    ],
  );
});

test("revokeSessionForUser revokes only another active session owned by the user", async () => {
  let updateArgs: unknown;

  prismaMock.session.updateMany = async (args: unknown) => {
    updateArgs = args;
    return { count: 1 };
  };

  const result = await revokeSessionForUser("user_1", "sid_other", "sid_current");

  assert.deepEqual((updateArgs as { where: unknown }).where, {
    id: "sid_other",
    userId: "user_1",
    revokedAt: null,
  });
  assert.ok((updateArgs as { data: { revokedAt: Date } }).data.revokedAt instanceof Date);
  assert.deepEqual(result, { revoked: true });
});

test("revokeSessionForUser refuses to revoke the current session", async () => {
  let updateCalls = 0;

  prismaMock.session.updateMany = async () => {
    updateCalls += 1;
    return { count: 1 };
  };

  const result = await revokeSessionForUser("user_1", "sid_current", "sid_current");

  assert.equal(updateCalls, 0);
  assert.deepEqual(result, { revoked: false });
});

test("revokeOtherSessionsForUser revokes active sessions except the current session", async () => {
  let updateArgs: unknown;

  prismaMock.session.updateMany = async (args: unknown) => {
    updateArgs = args;
    return { count: 2 };
  };

  const result = await revokeOtherSessionsForUser("user_1", "sid_current");

  assert.deepEqual((updateArgs as { where: unknown }).where, {
    userId: "user_1",
    revokedAt: null,
    id: {
      not: "sid_current",
    },
  });
  assert.ok((updateArgs as { data: { revokedAt: Date } }).data.revokedAt instanceof Date);
  assert.deepEqual(result, { revokedCount: 2 });
});
