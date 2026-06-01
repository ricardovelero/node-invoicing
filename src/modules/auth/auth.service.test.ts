import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../db/prisma";
import {
  authenticateUser,
  getInitialOrganizationForUser,
  registerUser,
} from "./auth.service";

type PrismaMock = {
  $transaction: unknown;
  user: {
    findUnique: unknown;
  };
};

const prismaMock = prisma as unknown as PrismaMock;

const originalTransaction = prismaMock.$transaction;
const originalFindUnique = prismaMock.user.findUnique;

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.user.findUnique = originalFindUnique;
});

test("registerUser normalizes email, hashes password, and creates the owner membership transactionally", async () => {
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

  const result = await registerUser({
    name: "Ada Lovelace",
    email: " ADA@example.COM ",
    password: "CorrectPassword1",
    organizationName: "Analytical Engines",
  });

  assert.deepEqual(result, { ok: true, userId: "user_1", organizationId: "org_1" });
  assert.equal(createdUserData?.name, "Ada Lovelace");
  assert.equal(createdUserData?.email, "ada@example.com");
  assert.equal(
    await bcrypt.compare("CorrectPassword1", createdUserData?.passwordHash as string),
    true,
  );
  assert.equal(createdOrganizationData?.name, "Analytical Engines");
  assert.deepEqual(createdMembershipData, {
    userId: "user_1",
    organizationId: "org_1",
    role: "OWNER",
  });
});

test("registerUser maps duplicate email errors to emailAlreadyExists", async () => {
  prismaMock.$transaction = async () => {
    throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["email"] },
    });
  };

  const result = await registerUser({
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "CorrectPassword1",
    organizationName: "Analytical Engines",
  });

  assert.deepEqual(result, { ok: false, reason: "emailAlreadyExists" });
});

test("authenticateUser normalizes email, verifies credentials, and returns the oldest membership", async () => {
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

  const result = await authenticateUser({
    email: " ADA@example.COM ",
    password: "correct-password",
  });

  assert.deepEqual(findUniqueArgs, {
    where: { email: "ada@example.com" },
    include: {
      memberships: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  assert.deepEqual(result, { ok: true, userId: "user_1", organizationId: "org_1" });
});

test("authenticateUser returns invalidCredentials for missing users and incorrect passwords", async () => {
  prismaMock.user.findUnique = async () => null;

  assert.deepEqual(
    await authenticateUser({ email: "missing@example.com", password: "password" }),
    { ok: false, reason: "invalidCredentials" },
  );

  const passwordHash = await bcrypt.hash("correct-password", 4);

  prismaMock.user.findUnique = async () => ({
    id: "user_1",
    passwordHash,
    memberships: [{ organizationId: "org_1" }],
  });

  assert.deepEqual(
    await authenticateUser({ email: "ada@example.com", password: "wrong-password" }),
    { ok: false, reason: "invalidCredentials" },
  );
});

test("authenticateUser returns noOrganizationMembership when credentials are valid without a membership", async () => {
  const passwordHash = await bcrypt.hash("correct-password", 4);

  prismaMock.user.findUnique = async () => ({
    id: "user_1",
    passwordHash,
    memberships: [],
  });

  const result = await authenticateUser({
    email: "ada@example.com",
    password: "correct-password",
  });

  assert.deepEqual(result, { ok: false, reason: "noOrganizationMembership" });
});

test("getInitialOrganizationForUser returns the oldest membership organization and role", async () => {
  let findUniqueArgs: unknown;

  prismaMock.user.findUnique = async (args: unknown) => {
    findUniqueArgs = args;
    return {
      memberships: [{ organizationId: "org_1", role: "OWNER" }],
    };
  };

  const result = await getInitialOrganizationForUser("user_1");

  assert.deepEqual(findUniqueArgs, {
    where: { id: "user_1" },
    include: {
      memberships: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          organizationId: true,
          role: true,
        },
      },
    },
  });
  assert.deepEqual(result, { ok: true, organizationId: "org_1", role: "OWNER" });
});

test("getInitialOrganizationForUser distinguishes missing users from users without memberships", async () => {
  prismaMock.user.findUnique = async () => null;

  assert.deepEqual(await getInitialOrganizationForUser("missing_user"), {
    ok: false,
    reason: "userNotFound",
  });

  prismaMock.user.findUnique = async () => ({ memberships: [] });

  assert.deepEqual(await getInitialOrganizationForUser("user_1"), {
    ok: false,
    reason: "noOrganizationMembership",
  });
});
