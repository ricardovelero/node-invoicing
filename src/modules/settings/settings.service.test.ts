import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import {
  createOrganizationForUser,
  getActiveSessionsForUser,
  getOrganizationsForUser,
  revokeOtherSessionsForUser,
  revokeSessionForUser,
  switchOrganizationForUser,
  updateLocalizationSettings,
  updateOrganizationSettings,
  updateSecuritySettings,
} from "./settings.service";

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

const originalTransaction = prismaMock.$transaction;
const originalUpdate = prismaMock.organization.update;
const originalMembershipFindMany = prismaMock.organizationMembership.findMany;
const originalMembershipFindFirst = prismaMock.organizationMembership.findFirst;
const originalSessionFindMany = prismaMock.session.findMany;
const originalSessionUpdateMany = prismaMock.session.updateMany;

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.organization.update = originalUpdate;
  prismaMock.organizationMembership.findMany = originalMembershipFindMany;
  prismaMock.organizationMembership.findFirst = originalMembershipFindFirst;
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
      name: "Analytical Engines Ltd",
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
    legalName: "Spanish Sole Trader",
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
    name: "Spanish Sole Trader",
    legalName: "Spanish Sole Trader",
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
      legalName: "Example Organisation",
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

test("getOrganizationsForUser lists memberships in creation order", async () => {
  let findManyArgs: unknown;
  prismaMock.organizationMembership.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [
      {
        role: "OWNER",
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        organization: {
          id: "11111111-1111-1111-1111-111111111111",
          name: "First Org",
        },
      },
      {
        role: "MEMBER",
        createdAt: new Date("2026-06-02T10:00:00.000Z"),
        organization: {
          id: "22222222-2222-2222-2222-222222222222",
          name: "Second Org",
        },
      },
    ];
  };

  const memberships = await getOrganizationsForUser("user_1");

  assert.deepEqual(findManyArgs, {
    where: { userId: "user_1" },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  assert.deepEqual(
    memberships.map(({ createdAt: _createdAt, ...membership }) => membership),
    [
      {
        organizationId: "11111111-1111-1111-1111-111111111111",
        organizationName: "First Org",
        role: "OWNER",
      },
      {
        organizationId: "22222222-2222-2222-2222-222222222222",
        organizationName: "Second Org",
        role: "MEMBER",
      },
    ],
  );
});

test("createOrganizationForUser creates an organization and owner membership", async () => {
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

  const result = await createOrganizationForUser("user_1", {
    name: "New Org",
  });

  assert.deepEqual(createdOrganizationData, {
    data: {
      name: "New Org",
      legalName: "New Org",
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
  assert.deepEqual(result, {
    organizationId: "33333333-3333-3333-3333-333333333333",
    sessionIdleTimeoutMinutes: 30,
    sessionAbsoluteLifetimeDays: 14,
  });
});

test("switchOrganizationForUser only succeeds for user memberships", async () => {
  let findFirstArgs: unknown;
  prismaMock.organizationMembership.findFirst = async (args: unknown) => {
    findFirstArgs = args;
    return {
      organization: {
        id: "22222222-2222-2222-2222-222222222222",
        sessionIdleTimeoutMinutes: 45,
        sessionAbsoluteLifetimeDays: 21,
      },
    };
  };

  const result = await switchOrganizationForUser(
    "user_1",
    "22222222-2222-2222-2222-222222222222",
  );

  assert.deepEqual(findFirstArgs, {
    where: {
      userId: "user_1",
      organizationId: "22222222-2222-2222-2222-222222222222",
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
  assert.deepEqual(result, {
    ok: true,
    organizationId: "22222222-2222-2222-2222-222222222222",
    sessionIdleTimeoutMinutes: 45,
    sessionAbsoluteLifetimeDays: 21,
  });

  prismaMock.organizationMembership.findFirst = async () => null;

  assert.deepEqual(
    await switchOrganizationForUser(
      "user_1",
      "99999999-9999-9999-9999-999999999999",
    ),
    { ok: false, reason: "notFound" },
  );
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
