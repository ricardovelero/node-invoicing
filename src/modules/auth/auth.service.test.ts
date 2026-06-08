import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../db/prisma";
import {
  authenticateUser,
  getInitialOrganizationForUser,
  getValidPasswordResetToken,
  requestPasswordReset,
  resetPasswordWithToken,
  registerUser,
  type PostmarkPasswordResetPayload,
} from "./auth.service";
import { env } from "../../config/env";

type PrismaMock = {
  $transaction: unknown;
  user: {
    findUnique: unknown;
    update: unknown;
  };
  passwordResetToken: {
    create: unknown;
    findFirst: unknown;
    update: unknown;
    updateMany: unknown;
  };
};

const prismaMock = prisma as unknown as PrismaMock;

const originalTransaction = prismaMock.$transaction;
const originalFindUnique = prismaMock.user.findUnique;
const originalUserUpdate = prismaMock.user.update;
const originalPasswordResetTokenCreate = prismaMock.passwordResetToken.create;
const originalPasswordResetTokenFindFirst = prismaMock.passwordResetToken.findFirst;
const originalPasswordResetTokenUpdate = prismaMock.passwordResetToken.update;
const originalPasswordResetTokenUpdateMany = prismaMock.passwordResetToken.updateMany;
const originalEnv = {
  APP_URL: env.APP_URL,
  POSTMARK_FROM: env.POSTMARK_FROM,
  POSTMARK_MESSAGE_STREAM: env.POSTMARK_MESSAGE_STREAM,
};

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.user.findUnique = originalFindUnique;
  prismaMock.user.update = originalUserUpdate;
  prismaMock.passwordResetToken.create = originalPasswordResetTokenCreate;
  prismaMock.passwordResetToken.findFirst = originalPasswordResetTokenFindFirst;
  prismaMock.passwordResetToken.update = originalPasswordResetTokenUpdate;
  prismaMock.passwordResetToken.updateMany = originalPasswordResetTokenUpdateMany;
  env.APP_URL = originalEnv.APP_URL;
  env.POSTMARK_FROM = originalEnv.POSTMARK_FROM;
  env.POSTMARK_MESSAGE_STREAM = originalEnv.POSTMARK_MESSAGE_STREAM;
});

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

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

test("requestPasswordReset normalizes email and no-ops for unknown accounts", async () => {
  let findUniqueArgs: unknown;
  let tokenCreateCalls = 0;

  prismaMock.user.findUnique = async (args: unknown) => {
    findUniqueArgs = args;
    return null;
  };
  prismaMock.passwordResetToken.create = async () => {
    tokenCreateCalls += 1;
    return { id: "reset_token_1" };
  };

  const result = await requestPasswordReset(
    " ADA@example.COM ",
    async () => {
      throw new Error("provider should not be called");
    },
  );

  assert.deepEqual(findUniqueArgs, {
    where: { email: "ada@example.com" },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });
  assert.deepEqual(result, { ok: true, emailSent: false, tokenCreated: false });
  assert.equal(tokenCreateCalls, 0);
});

test("requestPasswordReset stores a hashed token and sends a Postmark reset payload", async () => {
  let createArgs:
    | { data: { userId: string; tokenHash: string; expiresAt: Date } }
    | undefined;
  let payload: PostmarkPasswordResetPayload | undefined;
  env.APP_URL = "https://billing.example.com";
  env.POSTMARK_FROM = "SaaS Billing <billing@saas.example>";
  env.POSTMARK_MESSAGE_STREAM = "outbound";
  prismaMock.user.findUnique = async () => ({
    id: "user_1",
    email: "ada@example.com",
    name: "Ada Lovelace",
  });
  prismaMock.passwordResetToken.create = async (args: {
    data: { userId: string; tokenHash: string; expiresAt: Date };
  }) => {
    createArgs = args;
    return { id: "reset_token_1", ...args.data };
  };

  const result = await requestPasswordReset("ada@example.com", async (emailPayload) => {
    payload = emailPayload;
    return {
      ok: true,
      providerMessageId: "postmark-message-1",
      response: { MessageID: "postmark-message-1" },
    };
  });

  assert.deepEqual(result, { ok: true, emailSent: true, tokenCreated: true });
  assert.ok(createArgs);
  assert.equal(createArgs.data.userId, "user_1");
  assert.equal(createArgs.data.tokenHash.length, 64);
  assert.ok(createArgs.data.expiresAt.getTime() > Date.now());
  assert.ok(createArgs.data.expiresAt.getTime() <= Date.now() + 60 * 60 * 1000);
  assert.ok(payload);
  assert.equal(payload.From, "SaaS Billing <billing@saas.example>");
  assert.equal(payload.To, "ada@example.com");
  assert.equal(payload.Subject, "Reset your Invoicing password");
  assert.equal(payload.Tag, "password-reset");
  assert.equal(payload.MessageStream, "outbound");
  assert.equal(payload.TrackOpens, false);
  assert.equal(payload.TrackLinks, "None");
  assert.deepEqual(payload.Metadata, {
    userId: "user_1",
    passwordResetTokenId: "reset_token_1",
  });
  assert.match(payload.TextBody, /https:\/\/billing\.example\.com\/auth\/reset\//);
  assert.match(payload.HtmlBody, /Reset password/);

  const resetUrl = payload.TextBody.match(
    /https:\/\/billing\.example\.com\/auth\/reset\/(\S+)/,
  )?.[1];
  assert.ok(resetUrl);
  assert.equal(createArgs.data.tokenHash, hashToken(decodeURIComponent(resetUrl)));
});

test("requestPasswordReset keeps the generic result when the provider fails", async () => {
  prismaMock.user.findUnique = async () => ({
    id: "user_1",
    email: "ada@example.com",
    name: null,
  });
  prismaMock.passwordResetToken.create = async (args: unknown) => ({
    id: "reset_token_1",
    ...(args as { data: Record<string, unknown> }).data,
  });

  const result = await requestPasswordReset("ada@example.com", async () => ({
    ok: false,
    errorMessage: "Postmark is unavailable.",
  }));

  assert.deepEqual(result, { ok: true, emailSent: false, tokenCreated: true });
});

test("getValidPasswordResetToken returns the user for unexpired unused tokens", async () => {
  const token = "valid-token";
  let findFirstArgs: unknown;

  prismaMock.passwordResetToken.findFirst = async (args: unknown) => {
    findFirstArgs = args;
    return {
      id: "reset_token_1",
      user: {
        id: "user_1",
        email: "ada@example.com",
      },
    };
  };

  const result = await getValidPasswordResetToken(token);

  assert.deepEqual(result, {
    ok: true,
    userId: "user_1",
    email: "ada@example.com",
  });
  assert.deepEqual(findFirstArgs, {
    where: {
      tokenHash: hashToken(token),
      usedAt: null,
      expiresAt: {
        gt: findFirstArgs && (findFirstArgs as { where: { expiresAt: { gt: Date } } }).where.expiresAt.gt,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });
});

test("getValidPasswordResetToken rejects missing, used, or expired tokens", async () => {
  prismaMock.passwordResetToken.findFirst = async () => null;

  assert.deepEqual(await getValidPasswordResetToken("expired-token"), {
    ok: false,
    reason: "invalidOrExpired",
  });
});

test("resetPasswordWithToken hashes the password, consumes the token, and invalidates other reset tokens", async () => {
  let userUpdateArgs: { data: { passwordHash: string } } | undefined;
  let tokenUpdateArgs: unknown;
  let tokenUpdateManyArgs: unknown;

  prismaMock.$transaction = async (
    callback: (tx: {
      passwordResetToken: {
        findFirst: (args: unknown) => Promise<unknown>;
        update: (args: unknown) => Promise<unknown>;
        updateMany: (args: unknown) => Promise<unknown>;
      };
      user: {
        update: (args: { data: { passwordHash: string } }) => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      passwordResetToken: {
        async findFirst() {
          return { id: "reset_token_1", userId: "user_1" };
        },
        async update(args) {
          tokenUpdateArgs = args;
          return {};
        },
        async updateMany(args) {
          tokenUpdateManyArgs = args;
          return {};
        },
      },
      user: {
        async update(args) {
          userUpdateArgs = args;
          return {};
        },
      },
    });

  const result = await resetPasswordWithToken("valid-token", "CorrectPassword1");

  assert.deepEqual(result, { ok: true });
  assert.ok(userUpdateArgs);
  assert.equal(
    await bcrypt.compare("CorrectPassword1", userUpdateArgs.data.passwordHash),
    true,
  );
  assert.deepEqual(tokenUpdateArgs, {
    where: { id: "reset_token_1" },
    data: {
      usedAt:
        tokenUpdateArgs &&
        (tokenUpdateArgs as { data: { usedAt: Date } }).data.usedAt,
    },
  });
  assert.deepEqual(tokenUpdateManyArgs, {
    where: {
      userId: "user_1",
      usedAt: null,
      id: {
        not: "reset_token_1",
      },
    },
    data: {
      usedAt:
        tokenUpdateManyArgs &&
        (tokenUpdateManyArgs as { data: { usedAt: Date } }).data.usedAt,
    },
  });
});

test("resetPasswordWithToken rejects invalid tokens without updating the user", async () => {
  let userUpdateCalls = 0;

  prismaMock.$transaction = async (
    callback: (tx: {
      passwordResetToken: {
        findFirst: () => Promise<unknown>;
      };
      user: {
        update: () => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      passwordResetToken: {
        async findFirst() {
          return null;
        },
      },
      user: {
        async update() {
          userUpdateCalls += 1;
          return {};
        },
      },
    });

  const result = await resetPasswordWithToken("expired-token", "CorrectPassword1");

  assert.deepEqual(result, { ok: false, reason: "invalidOrExpired" });
  assert.equal(userUpdateCalls, 0);
});
