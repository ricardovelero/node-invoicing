import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { loadAuthContext, requireOrganizationRole } from "./auth";

const prismaMock = prisma as unknown as {
  organizationMembership: {
    findMany: unknown;
  };
};
const originalFindMany = prismaMock.organizationMembership.findMany;

afterEach(() => {
  prismaMock.organizationMembership.findMany = originalFindMany;
});

const createNext = () => {
  let error: unknown;
  const next: NextFunction = (nextError?: unknown) => {
    error = nextError;
  };

  return {
    next,
    get error() {
      return error;
    },
  };
};

test("requireOrganizationRole allows configured roles", () => {
  const req = {
    auth: { role: "ADMIN" },
  } as Request;
  const next = createNext();

  requireOrganizationRole(["OWNER", "ADMIN"])(req, {} as Response, next.next);

  assert.equal(next.error, undefined);
});

test("requireOrganizationRole rejects unauthorized roles", () => {
  const req = {
    auth: { role: "MEMBER" },
  } as Request;
  const next = createNext();

  requireOrganizationRole(["OWNER", "ADMIN"])(req, {} as Response, next.next);

  const error = next.error as Error & { status?: number };

  assert.equal(error.message, "You do not have permission to edit organization settings.");
  assert.equal(error.status, 403);
});

const organization = (id: string, name: string, locale = "en-GB") => ({
  id,
  name,
  legalName: null,
  billingEmail: null,
  taxId: null,
  addressLine1: null,
  city: null,
  country: null,
  countryCode: null,
  legalForm: "other",
  currency: "EUR",
  locale,
  paymentInstructions: null,
  withholdingEnabled: false,
  defaultWithholdingType: null,
  defaultWithholdingRate: null,
  sessionIdleTimeoutMinutes: 30,
  sessionAbsoluteLifetimeDays: 14,
});

const user = {
  id: "user_1",
  email: "ada@example.com",
  name: "Ada Lovelace",
  fullName: "Augusta Ada Lovelace",
  timeZone: "Europe/London",
};

const createAuthRequest = (organizationId?: string) =>
  ({
    session: {
      userId: "user_1",
      organizationId,
    },
  }) as Request;

const createAuthResponse = () =>
  ({
    locals: {},
  }) as Response & { locals: Record<string, unknown> };

test("loadAuthContext selects the session organization when membership exists", async () => {
  prismaMock.organizationMembership.findMany = async () => [
    {
      userId: "user_1",
      organizationId: "11111111-1111-1111-1111-111111111111",
      role: "OWNER",
      user,
      organization: organization("11111111-1111-1111-1111-111111111111", "First"),
    },
    {
      userId: "user_1",
      organizationId: "22222222-2222-2222-2222-222222222222",
      role: "ADMIN",
      user,
      organization: organization("22222222-2222-2222-2222-222222222222", "Second"),
    },
  ];
  const req = createAuthRequest("22222222-2222-2222-2222-222222222222");
  const res = createAuthResponse();
  const next = createNext();

  await loadAuthContext(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(req.auth?.organization.id, "22222222-2222-2222-2222-222222222222");
  assert.equal(req.auth?.role, "ADMIN");
  assert.equal(req.auth?.user.fullName, "Augusta Ada Lovelace");
  assert.equal(req.auth?.user.timeZone, "Europe/London");
  assert.equal(req.session.organizationId, "22222222-2222-2222-2222-222222222222");
  assert.deepEqual(res.locals.currentUser, user);
  assert.deepEqual(res.locals.availableOrganizations, [
    {
      id: "11111111-1111-1111-1111-111111111111",
      name: "First",
      role: "OWNER",
      isCurrent: false,
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Second",
      role: "ADMIN",
      isCurrent: true,
    },
  ]);
});

test("loadAuthContext falls back when the session organization is stale", async () => {
  prismaMock.organizationMembership.findMany = async () => [
    {
      userId: "user_1",
      organizationId: "11111111-1111-1111-1111-111111111111",
      role: "OWNER",
      user,
      organization: organization("11111111-1111-1111-1111-111111111111", "First"),
    },
  ];
  const req = createAuthRequest("99999999-9999-9999-9999-999999999999");
  const res = createAuthResponse();
  const next = createNext();

  await loadAuthContext(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(req.auth?.organization.id, "11111111-1111-1111-1111-111111111111");
  assert.equal(req.session.organizationId, "11111111-1111-1111-1111-111111111111");
  assert.equal(req.session.sessionIdleTimeoutMinutes, 30);
  assert.equal(req.session.sessionAbsoluteLifetimeDays, 14);
});

test("loadAuthContext clears sessions without memberships", async () => {
  prismaMock.organizationMembership.findMany = async () => [];
  const req = createAuthRequest("11111111-1111-1111-1111-111111111111");
  const res = createAuthResponse();
  const next = createNext();

  await loadAuthContext(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(req.auth, undefined);
  assert.equal(req.session.userId, undefined);
  assert.equal(req.session.organizationId, undefined);
  assert.deepEqual(res.locals.availableOrganizations, []);
});
