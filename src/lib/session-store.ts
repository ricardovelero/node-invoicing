import session, { type SessionData } from "express-session";
import { Prisma } from "@prisma/client";
import {
  daysToMs,
  defaultSessionIdleTimeoutMinutes,
  minutesToMs,
} from "./session-policy";

type StoredSession = {
  data: Prisma.JsonValue;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  organization: {
    sessionIdleTimeoutMinutes: number;
  } | null;
};

type SessionDelegate = {
  findUnique: (args: {
    where: { id: string };
    select: {
      data: true;
      expiresAt: true;
      lastSeenAt: true;
      revokedAt: true;
      organization: {
        select: {
          sessionIdleTimeoutMinutes: true;
        };
      };
    };
  }) => Promise<StoredSession | null>;
  upsert: (args: {
    where: { id: string };
    create: {
      id: string;
      data: Prisma.InputJsonValue;
      userId: string | null;
      organizationId: string | null;
      expiresAt: Date;
      lastSeenAt: Date;
      userAgent: string | null;
      ip: string | null;
    };
    update: {
      data: Prisma.InputJsonValue;
      userId: string | null;
      organizationId: string | null;
      lastSeenAt: Date;
      userAgent: string | null;
      ip: string | null;
    };
  }) => Promise<unknown>;
  updateMany: (args: {
    where: { id: string };
    data: Partial<{
      lastSeenAt: Date;
      revokedAt: Date;
    }>;
  }) => Promise<unknown>;
};

export type PrismaSessionStoreOptions = {
  session: SessionDelegate;
  maxAgeMs: number;
  now?: () => Date;
};

const toNullableString = (value: unknown) =>
  typeof value === "string" && value ? value : null;

const toPositiveNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;

const serializeSession = (sessionData: SessionData) =>
  JSON.parse(JSON.stringify(sessionData)) as Prisma.InputJsonValue;

const deserializeSession = (data: Prisma.JsonValue) =>
  data as unknown as SessionData;

export class PrismaSessionStore extends session.Store {
  private readonly sessionDelegate: SessionDelegate;
  private readonly maxAgeMs: number;
  private readonly now: () => Date;

  constructor(options: PrismaSessionStoreOptions) {
    super();
    this.sessionDelegate = options.session;
    this.maxAgeMs = options.maxAgeMs;
    this.now = options.now ?? (() => new Date());
  }

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void) {
    void this.getSession(sid)
      .then((sessionData) => callback(null, sessionData))
      .catch((error) => callback(error));
  }

  set(sid: string, sessionData: SessionData, callback?: (err?: unknown) => void) {
    void this.setSession(sid, sessionData)
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  destroy(sid: string, callback?: (err?: unknown) => void) {
    void this.revokeSession(sid)
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  touch(sid: string, _sessionData: SessionData, callback?: () => void) {
    void this.touchSession(sid)
      .then(() => callback?.())
      .catch((error) => {
        (callback as ((err?: unknown) => void) | undefined)?.(error);
      });
  }

  private async getSession(sid: string) {
    const storedSession = await this.sessionDelegate.findUnique({
      where: { id: sid },
      select: {
        data: true,
        expiresAt: true,
        lastSeenAt: true,
        revokedAt: true,
        organization: {
          select: {
            sessionIdleTimeoutMinutes: true,
          },
        },
      },
    });

    if (!storedSession || storedSession.revokedAt || storedSession.expiresAt <= this.now()) {
      return null;
    }

    const idleTimeoutMinutes =
      storedSession.organization?.sessionIdleTimeoutMinutes ??
      defaultSessionIdleTimeoutMinutes;
    const idleExpiresAt = new Date(
      storedSession.lastSeenAt.getTime() + minutesToMs(idleTimeoutMinutes),
    );

    if (idleExpiresAt <= this.now()) {
      return null;
    }

    return deserializeSession(storedSession.data);
  }

  private async setSession(sid: string, sessionData: SessionData) {
    const now = this.now();
    const absoluteLifetimeDays = toPositiveNumber(
      sessionData.sessionAbsoluteLifetimeDays,
    );
    const expiresAt = new Date(
      now.getTime() +
        (absoluteLifetimeDays ? daysToMs(absoluteLifetimeDays) : this.maxAgeMs),
    );
    const data = serializeSession(sessionData);
    const userId = toNullableString(sessionData.userId);
    const organizationId = toNullableString(sessionData.organizationId);
    const userAgent = toNullableString(sessionData.userAgent);
    const ip = toNullableString(sessionData.ip);

    await this.sessionDelegate.upsert({
      where: { id: sid },
      create: {
        id: sid,
        data,
        userId,
        organizationId,
        expiresAt,
        lastSeenAt: now,
        userAgent,
        ip,
      },
      update: {
        data,
        userId,
        organizationId,
        lastSeenAt: now,
        userAgent,
        ip,
      },
    });
  }

  private async revokeSession(sid: string) {
    await this.sessionDelegate.updateMany({
      where: { id: sid },
      data: {
        revokedAt: this.now(),
      },
    });
  }

  private async touchSession(sid: string) {
    await this.sessionDelegate.updateMany({
      where: { id: sid },
      data: {
        lastSeenAt: this.now(),
      },
    });
  }
}
