import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { loginUser, logoutUser, registerUser } from "./auth.controller";

type MockSession = {
  userId?: string;
  organizationId?: string;
  regenerateCalls: number;
  destroyCalls: number;
  regenerate: (callback: (error?: Error) => void) => void;
  destroy: (callback: (error?: Error) => void) => void;
};

type MockRequest = Request & {
  body: Record<string, unknown>;
  session: MockSession;
  flashMessages: Record<string, string[]>;
};

type MockResponse = Response & {
  redirectedTo?: string;
  renderedView?: string;
  renderedData?: unknown;
  clearedCookies: string[];
};

const prismaMock = prisma as unknown as {
  $transaction: unknown;
  user: {
    findUnique: unknown;
  };
};

const originalTransaction = prismaMock.$transaction;
const originalFindUnique = prismaMock.user.findUnique;

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.user.findUnique = originalFindUnique;
});

const createRequest = (body: Record<string, unknown> = {}) => {
  const session: MockSession = {
    regenerateCalls: 0,
    destroyCalls: 0,
    regenerate(callback) {
      this.regenerateCalls += 1;
      callback();
    },
    destroy(callback) {
      this.destroyCalls += 1;
      delete this.userId;
      delete this.organizationId;
      callback();
    },
  };

  const req = {
    body,
    session,
    flashMessages: {},
    flash(type: string, message: string) {
      this.flashMessages[type] ??= [];
      this.flashMessages[type].push(message);
      return this.flashMessages[type];
    },
  } as MockRequest;

  return req;
};

const createResponse = () => {
  const res: {
    redirectedTo?: string;
    renderedView?: string;
    renderedData?: unknown;
    clearedCookies: string[];
    redirect?: (path: string) => MockResponse;
    render?: (view: string, data: unknown) => MockResponse;
    clearCookie?: (name: string) => MockResponse;
  } = {
    clearedCookies: [],
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
  res.clearCookie = (name: string) => {
    res.clearedCookies.push(name);
    return res as unknown as MockResponse;
  };

  return res as unknown as MockResponse;
};

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

test("registerUser creates the account, organization, owner membership, and session", async () => {
  let createdUserData: Record<string, unknown> | undefined;
  let createdOrganizationData: Record<string, unknown> | undefined;
  let createdMembershipData: Record<string, unknown> | undefined;

  prismaMock.$transaction = async (
    callback: (tx: {
      user: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> };
      organization: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> };
      organizationMembership: { create: (args: { data: Record<string, unknown> }) => Promise<void> };
    }) => Promise<unknown>,
  ) =>
    callback({
      user: {
        async create(args) {
          createdUserData = args.data;
          return { id: "user_1" };
        },
      },
      organization: {
        async create(args) {
          createdOrganizationData = args.data;
          return { id: "org_1" };
        },
      },
      organizationMembership: {
        async create(args) {
          createdMembershipData = args.data;
        },
      },
    });

  const req = createRequest({
    name: " Ada Lovelace ",
    email: " ADA@example.COM ",
    password: "correct-password",
    organizationName: " Analytical Engines ",
  });
  const res = createResponse();
  const next = createNext();

  await registerUser(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(createdUserData?.name, "Ada Lovelace");
  assert.equal(createdUserData?.email, "ada@example.com");
  assert.notEqual(createdUserData?.passwordHash, "correct-password");
  assert.equal(createdOrganizationData?.name, "Analytical Engines");
  assert.deepEqual(createdMembershipData, {
    userId: "user_1",
    organizationId: "org_1",
    role: "OWNER",
  });
  assert.equal(req.session.regenerateCalls, 1);
  assert.equal(req.session.userId, "user_1");
  assert.equal(req.session.organizationId, "org_1");
  assert.deepEqual(req.flashMessages.success, ["Account created successfully."]);
  assert.equal(res.redirectedTo, "/");
});

test("loginUser verifies credentials and stores the first organization in session", async () => {
  const passwordHash = await bcrypt.hash("correct-password", 4);
  let findUniqueArgs: unknown;

  prismaMock.user.findUnique = async (args: unknown) => {
    findUniqueArgs = args;
    return {
      id: "user_1",
      passwordHash,
      memberships: [{ organizationId: "org_1" }],
    };
  };

  const req = createRequest({
    email: " ADA@example.COM ",
    password: "correct-password",
  });
  const res = createResponse();
  const next = createNext();

  await loginUser(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.deepEqual(findUniqueArgs, {
    where: { email: "ada@example.com" },
    include: {
      memberships: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  assert.equal(req.session.regenerateCalls, 1);
  assert.equal(req.session.userId, "user_1");
  assert.equal(req.session.organizationId, "org_1");
  assert.equal(res.redirectedTo, "/");
});

test("loginUser rejects invalid credentials without creating a session", async () => {
  const passwordHash = await bcrypt.hash("correct-password", 4);

  prismaMock.user.findUnique = async () => ({
    id: "user_1",
    passwordHash,
    memberships: [{ organizationId: "org_1" }],
  });

  const req = createRequest({
    email: "ada@example.com",
    password: "wrong-password",
  });
  const res = createResponse();
  const next = createNext();

  await loginUser(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(req.session.regenerateCalls, 0);
  assert.equal(req.session.userId, undefined);
  assert.equal(req.session.organizationId, undefined);
  assert.deepEqual(req.flashMessages.error, ["Incorrect credentials."]);
  assert.equal(res.redirectedTo, "/auth/login");
});

test("logoutUser destroys the session, clears the session cookie, and redirects to login", async () => {
  const req = createRequest();
  req.session.userId = "user_1";
  req.session.organizationId = "org_1";
  const res = createResponse();
  const next = createNext();

  await logoutUser(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(req.session.destroyCalls, 1);
  assert.equal(req.session.userId, undefined);
  assert.equal(req.session.organizationId, undefined);
  assert.deepEqual(res.clearedCookies, ["invoice.sid"]);
  assert.equal(res.redirectedTo, "/auth/login");
});
