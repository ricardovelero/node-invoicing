import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import type { SessionData } from "express-session";
import { PrismaSessionStore } from "./session-store";

type StoredSession = {
  data: Prisma.JsonValue;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date;
  userId: string | null;
  organizationId: string | null;
  userAgent: string | null;
  ip: string | null;
};

type SessionUpdate = Omit<Partial<StoredSession>, "data"> & {
  data?: Prisma.InputJsonValue;
};

const dayMs = 24 * 60 * 60 * 1000;
const sessionMaxAgeMs = 14 * dayMs;

const createMemoryDelegate = (rows: Record<string, StoredSession> = {}) => ({
  rows,
  delegate: {
    async findUnique(args: { where: { id: string } }) {
      const row = rows[args.where.id];

      return row
        ? {
            data: row.data,
            expiresAt: row.expiresAt,
            revokedAt: row.revokedAt,
          }
        : null;
    },
    async upsert(args: {
      where: { id: string };
      create: {
        data: Prisma.InputJsonValue;
        expiresAt: Date;
        lastSeenAt: Date;
        userId: string | null;
        organizationId: string | null;
        userAgent: string | null;
        ip: string | null;
      };
      update: SessionUpdate;
    }) {
      const row = rows[args.where.id];

      if (row) {
        const nextRow = {
          ...row,
          ...args.update,
        };
        rows[args.where.id] = {
          ...nextRow,
          data: (args.update.data ?? row.data) as Prisma.JsonValue,
        };
        return rows[args.where.id];
      }

      rows[args.where.id] = {
        data: args.create.data as Prisma.JsonValue,
        expiresAt: args.create.expiresAt,
        revokedAt: null,
        lastSeenAt: args.create.lastSeenAt,
        userId: args.create.userId,
        organizationId: args.create.organizationId,
        userAgent: args.create.userAgent,
        ip: args.create.ip,
      };

      return rows[args.where.id];
    },
    async updateMany(args: {
      where: { id: string };
      data: SessionUpdate;
    }) {
      const row = rows[args.where.id];

      if (row) {
        const nextRow = {
          ...row,
          ...args.data,
        };
        rows[args.where.id] = {
          ...nextRow,
          data: (args.data.data ?? row.data) as Prisma.JsonValue,
        };
      }

      return { count: row ? 1 : 0 };
    },
  },
});

const createStore = (
  rows: Record<string, StoredSession> = {},
  now = new Date("2026-06-11T10:00:00.000Z"),
) => {
  const memoryDelegate = createMemoryDelegate(rows);

  return {
    ...memoryDelegate,
    store: new PrismaSessionStore({
      session: memoryDelegate.delegate,
      maxAgeMs: sessionMaxAgeMs,
      now: () => now,
    }),
  };
};

const getSession = (store: PrismaSessionStore, sid: string) =>
  new Promise<SessionData | null | undefined>((resolve, reject) => {
    store.get(sid, (error, sessionData) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(sessionData);
    });
  });

const setSession = (
  store: PrismaSessionStore,
  sid: string,
  sessionData: SessionData,
) =>
  new Promise<void>((resolve, reject) => {
    store.set(sid, sessionData, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const destroySession = (store: PrismaSessionStore, sid: string) =>
  new Promise<void>((resolve, reject) => {
    store.destroy(sid, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

test("PrismaSessionStore returns stored session data", async () => {
  const { store } = createStore({
    sid_1: {
      data: { userId: "user_1", csrfToken: "token" },
      expiresAt: new Date("2026-06-25T10:00:00.000Z"),
      revokedAt: null,
      lastSeenAt: new Date("2026-06-11T10:00:00.000Z"),
      userId: "user_1",
      organizationId: "org_1",
      userAgent: "Browser",
      ip: "203.0.113.10",
    },
  });

  assert.deepEqual(await getSession(store, "sid_1"), {
    userId: "user_1",
    csrfToken: "token",
  });
});

test("PrismaSessionStore rejects expired and revoked sessions", async () => {
  const baseRow = {
    data: { userId: "user_1" },
    lastSeenAt: new Date("2026-06-11T10:00:00.000Z"),
    userId: "user_1",
    organizationId: "org_1",
    userAgent: "Browser",
    ip: "203.0.113.10",
  };
  const { store } = createStore({
    expired: {
      ...baseRow,
      expiresAt: new Date("2026-06-11T09:59:59.000Z"),
      revokedAt: null,
    },
    revoked: {
      ...baseRow,
      expiresAt: new Date("2026-06-25T10:00:00.000Z"),
      revokedAt: new Date("2026-06-12T10:00:00.000Z"),
    },
  });

  assert.equal(await getSession(store, "expired"), null);
  assert.equal(await getSession(store, "revoked"), null);
});

test("PrismaSessionStore creates rows with metadata and a fixed lifetime", async () => {
  const now = new Date("2026-06-11T10:00:00.000Z");
  const { store, rows } = createStore({}, now);

  await setSession(store, "sid_1", {
    userId: "user_1",
    organizationId: "11111111-1111-1111-1111-111111111111",
    userAgent: "Browser",
    ip: "203.0.113.10",
  } as SessionData);

  assert.deepEqual(rows.sid_1.data, {
    userId: "user_1",
    organizationId: "11111111-1111-1111-1111-111111111111",
    userAgent: "Browser",
    ip: "203.0.113.10",
  });
  assert.equal(rows.sid_1.userId, "user_1");
  assert.equal(rows.sid_1.organizationId, "11111111-1111-1111-1111-111111111111");
  assert.equal(rows.sid_1.userAgent, "Browser");
  assert.equal(rows.sid_1.ip, "203.0.113.10");
  assert.equal(rows.sid_1.lastSeenAt.getTime(), now.getTime());
  assert.equal(rows.sid_1.expiresAt.getTime(), now.getTime() + sessionMaxAgeMs);
});

test("PrismaSessionStore updates metadata without extending the original expiry", async () => {
  let now = new Date("2026-06-11T10:00:00.000Z");
  const memoryDelegate = createMemoryDelegate();
  const store = new PrismaSessionStore({
    session: memoryDelegate.delegate,
    maxAgeMs: sessionMaxAgeMs,
    now: () => now,
  });

  await setSession(store, "sid_1", {
    userId: "user_1",
    organizationId: "11111111-1111-1111-1111-111111111111",
  } as SessionData);
  const originalExpiresAt = memoryDelegate.rows.sid_1.expiresAt;

  now = new Date("2026-06-12T10:00:00.000Z");
  await setSession(store, "sid_1", {
    userId: "user_2",
    organizationId: "22222222-2222-2222-2222-222222222222",
  } as SessionData);

  assert.equal(memoryDelegate.rows.sid_1.userId, "user_2");
  assert.equal(memoryDelegate.rows.sid_1.organizationId, "22222222-2222-2222-2222-222222222222");
  assert.equal(memoryDelegate.rows.sid_1.lastSeenAt.getTime(), now.getTime());
  assert.equal(memoryDelegate.rows.sid_1.expiresAt.getTime(), originalExpiresAt.getTime());
});

test("PrismaSessionStore touches lastSeenAt and preserves session data", async () => {
  const now = new Date("2026-06-11T10:00:00.000Z");
  const { store, rows } = createStore({
    sid_1: {
      data: { userId: "user_1" },
      expiresAt: new Date("2026-06-25T10:00:00.000Z"),
      revokedAt: null,
      lastSeenAt: new Date("2026-06-10T10:00:00.000Z"),
      userId: "user_1",
      organizationId: "org_1",
      userAgent: "Browser",
      ip: "203.0.113.10",
    },
  }, now);

  await new Promise<void>((resolve) => {
    store.touch("sid_1", {} as SessionData, () => resolve());
  });

  assert.equal(rows.sid_1.lastSeenAt.getTime(), now.getTime());
  assert.deepEqual(rows.sid_1.data, { userId: "user_1" });
});

test("PrismaSessionStore marks sessions revoked on destroy", async () => {
  const now = new Date("2026-06-11T10:00:00.000Z");
  const { store, rows } = createStore({
    sid_1: {
      data: { userId: "user_1" },
      expiresAt: new Date("2026-06-25T10:00:00.000Z"),
      revokedAt: null,
      lastSeenAt: new Date("2026-06-10T10:00:00.000Z"),
      userId: "user_1",
      organizationId: "org_1",
      userAgent: "Browser",
      ip: "203.0.113.10",
    },
  }, now);

  await destroySession(store, "sid_1");

  assert.equal(rows.sid_1.revokedAt?.getTime(), now.getTime());
  assert.equal(await getSession(store, "sid_1"), null);
});
