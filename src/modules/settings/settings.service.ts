import { prisma } from "../../db/prisma";
import {
  defaultSessionIdleTimeoutMinutes,
  minutesToMs,
} from "../../lib/session-policy";
import { normalizeOrganizationWithholdingSettings } from "../../lib/withholding";
import type {
  LocalizationSettingsForm,
  OrganizationSettingsForm,
  SecuritySettingsForm,
} from "./settings.schema";

const emptyToNull = (value: string) => value || null;

const createOrganizationSettingsData = (data: OrganizationSettingsForm) => {
  const withholdingSettings = normalizeOrganizationWithholdingSettings({
    countryCode: data.countryCode,
    legalForm: data.legalForm,
    withholdingEnabled: data.withholdingEnabled,
    defaultWithholdingType: data.defaultWithholdingType || null,
    defaultWithholdingRate: data.defaultWithholdingRate,
  });

  return {
    name: data.legalName,
    legalName: data.legalName,
    billingEmail: emptyToNull(data.billingEmail),
    taxId: emptyToNull(data.taxId),
    addressLine1: emptyToNull(data.addressLine1),
    city: emptyToNull(data.city),
    countryCode: withholdingSettings.countryCode,
    legalForm: withholdingSettings.legalForm,
    currency: data.currency,
    withholdingEnabled: withholdingSettings.withholdingEnabled,
    defaultWithholdingType: withholdingSettings.defaultWithholdingType,
    defaultWithholdingRate: withholdingSettings.defaultWithholdingRate,
    paymentInstructions: emptyToNull(data.paymentInstructions),
  };
};

export type ActiveSession = {
  id: string;
  isCurrent: boolean;
  browserDevice: string;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

export type OrganizationMembershipView = {
  organizationId: string;
  organizationName: string;
  role: string;
  createdAt: Date;
};

export type SwitchOrganizationResult =
  | {
      ok: true;
      organizationId: string;
      sessionIdleTimeoutMinutes: number;
      sessionAbsoluteLifetimeDays: number;
    }
  | { ok: false; reason: "notFound" };

const detectBrowser = (userAgent: string | null) => {
  if (!userAgent) {
    return "Unknown browser";
  }

  if (/Edg\//i.test(userAgent)) {
    return "Edge";
  }

  if (/Firefox\//i.test(userAgent)) {
    return "Firefox";
  }

  if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) {
    return "Chrome";
  }

  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) {
    return "Safari";
  }

  return "Unknown browser";
};

const detectDevice = (userAgent: string | null) => {
  if (!userAgent) {
    return "Unknown device";
  }

  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return "iOS";
  }

  if (/Android/i.test(userAgent)) {
    return "Android";
  }

  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return "macOS";
  }

  if (/Windows/i.test(userAgent)) {
    return "Windows";
  }

  if (/Linux/i.test(userAgent)) {
    return "Linux";
  }

  return "Unknown device";
};

const describeBrowserDevice = (userAgent: string | null) => {
  const browser = detectBrowser(userAgent);
  const device = detectDevice(userAgent);

  if (browser === "Unknown browser" && device === "Unknown device") {
    return "Unknown browser or device";
  }

  return `${browser} on ${device}`;
};

const isIdleExpired = (
  lastSeenAt: Date,
  idleTimeoutMinutes: number | null | undefined,
  now: Date,
) => {
  const timeoutMinutes = idleTimeoutMinutes ?? defaultSessionIdleTimeoutMinutes;
  return lastSeenAt.getTime() + minutesToMs(timeoutMinutes) <= now.getTime();
};

export const updateOrganizationSettings = (
  organizationId: string,
  data: OrganizationSettingsForm,
) => {
  return prisma.organization.update({
    where: { id: organizationId },
    data: createOrganizationSettingsData(data),
  });
};

export const updateLocalizationSettings = (
  organizationId: string,
  data: LocalizationSettingsForm,
) =>
  prisma.organization.update({
    where: { id: organizationId },
    data: {
      locale: data.locale,
    },
  });

export const updateSecuritySettings = (
  organizationId: string,
  data: SecuritySettingsForm,
) =>
  prisma.organization.update({
    where: { id: organizationId },
    data: {
      sessionIdleTimeoutMinutes: data.sessionIdleTimeoutMinutes,
      sessionAbsoluteLifetimeDays: data.sessionAbsoluteLifetimeDays,
    },
  });

export const getOrganizationsForUser = async (
  userId: string,
): Promise<OrganizationMembershipView[]> => {
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId },
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

  return memberships.map((membership) => ({
    organizationId: membership.organization.id,
    organizationName: membership.organization.name,
    role: membership.role,
    createdAt: membership.createdAt,
  }));
};

export const createOrganizationForUser = async (
  userId: string,
  data: OrganizationSettingsForm,
) =>
  prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: createOrganizationSettingsData(data),
      select: {
        id: true,
      },
    });

    await tx.organizationMembership.create({
      data: {
        userId,
        organizationId: organization.id,
        role: "OWNER",
      },
    });

    return {
      organizationId: organization.id,
    };
  });

export const switchOrganizationForUser = async (
  userId: string,
  organizationId: string,
): Promise<SwitchOrganizationResult> => {
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId,
      organizationId,
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

  if (!membership) {
    return { ok: false, reason: "notFound" };
  }

  return {
    ok: true,
    organizationId: membership.organization.id,
    sessionIdleTimeoutMinutes: membership.organization.sessionIdleTimeoutMinutes,
    sessionAbsoluteLifetimeDays: membership.organization.sessionAbsoluteLifetimeDays,
  };
};

export const getActiveSessionsForUser = async (
  userId: string,
  currentSessionId: string,
  now = new Date(),
): Promise<ActiveSession[]> => {
  const sessions = await prisma.session.findMany({
    where: {
      userId,
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

  return sessions
    .filter(
      (session) =>
        !isIdleExpired(
          session.lastSeenAt,
          session.organization?.sessionIdleTimeoutMinutes,
          now,
        ),
    )
    .map((session) => ({
      id: session.id,
      isCurrent: session.id === currentSessionId,
      browserDevice: describeBrowserDevice(session.userAgent),
      ip: session.ip,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
    }))
    .sort((a, b) => {
      if (a.isCurrent) {
        return -1;
      }

      if (b.isCurrent) {
        return 1;
      }

      return b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
    });
};

export const revokeSessionForUser = async (
  userId: string,
  sessionId: string,
  currentSessionId: string,
) => {
  if (sessionId === currentSessionId) {
    return { revoked: false };
  }

  const result = await prisma.session.updateMany({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return { revoked: result.count > 0 };
};

export const revokeOtherSessionsForUser = async (
  userId: string,
  currentSessionId: string,
) => {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      id: {
        not: currentSessionId,
      },
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return { revokedCount: result.count };
};
