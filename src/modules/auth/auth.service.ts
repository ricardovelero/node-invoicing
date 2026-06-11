import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { Prisma, type OrganizationRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import nunjucks from 'nunjucks';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import {
  defaultSessionAbsoluteLifetimeDays,
  defaultSessionIdleTimeoutMinutes,
} from '../../lib/session-policy';
import type { RegisterForm } from './auth.schema';

export type AuthSessionContext = {
  userId: string;
  organizationId: string;
  sessionIdleTimeoutMinutes: number;
  sessionAbsoluteLifetimeDays: number;
};

export type RegisterUserResult =
  | ({ ok: true } & AuthSessionContext)
  | { ok: false; reason: 'emailAlreadyExists' | 'databaseError' };

export type AuthenticateUserResult =
  | ({ ok: true } & AuthSessionContext)
  | {
      ok: false;
      reason:
        | 'invalidCredentials'
        | 'noOrganizationMembership'
        | 'databaseError';
    };

export type InitialOrganizationResult =
  | { ok: true; organizationId: string; role: OrganizationRole }
  | {
      ok: false;
      reason: 'noOrganizationMembership' | 'userNotFound' | 'databaseError';
    };

export type PostmarkPasswordResetPayload = {
  From: string;
  To: string;
  Subject: string;
  HtmlBody: string;
  TextBody: string;
  Tag: string;
  Metadata: Record<string, string>;
  MessageStream: string;
  TrackOpens: boolean;
  TrackLinks: 'None';
};

export type SendPasswordResetEmail = (
  payload: PostmarkPasswordResetPayload,
) => Promise<
  | {
      ok: true;
      providerMessageId: string;
      submittedAt?: string;
      response: unknown;
    }
  | { ok: false; errorMessage: string; response?: unknown }
>;

export type RequestPasswordResetResult =
  | { ok: true; emailSent: boolean; tokenCreated: boolean }
  | { ok: false; reason: 'databaseError' };

export type PasswordResetTokenResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: 'invalidOrExpired' | 'databaseError' };

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; reason: 'invalidOrExpired' | 'databaseError' };

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: 'invalidCurrentPassword' | 'userNotFound' | 'databaseError' };

const passwordResetEmailViewsPath = path.join(process.cwd(), 'src', 'views');
const passwordResetEmailNunjucksEnv = nunjucks.configure(
  passwordResetEmailViewsPath,
  {
    autoescape: true,
    noCache: env.NODE_ENV === 'development',
  },
);

const normalizeEmail = (email: string) => email.toLowerCase().trim();

const hashPassword = (password: string) => bcrypt.hash(password, 12);

const verifyPassword = (password: string, passwordHash: string) =>
  bcrypt.compare(password, passwordHash);

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const createPasswordResetToken = () => randomBytes(32).toString('base64url');

const getAppUrl = () =>
  (env.APP_URL ?? `http://localhost:${env.PORT}`).replace(/\/$/, '');

const isPrismaDatabaseError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError ||
  error instanceof Prisma.PrismaClientUnknownRequestError ||
  error instanceof Prisma.PrismaClientRustPanicError ||
  error instanceof Prisma.PrismaClientInitializationError;

const passwordResetExpiresAt = () => new Date(Date.now() + 60 * 60 * 1000);

const createPasswordResetUrl = (token: string) =>
  `${getAppUrl()}/auth/reset/${encodeURIComponent(token)}`;

const renderPasswordResetEmailBodies = (data: {
  resetUrl: string;
  user: { email: string; name: string | null };
}) => ({
  htmlBody: passwordResetEmailNunjucksEnv.render(
    'emails/auth/password-reset-html.njk',
    data,
  ),
  textBody: passwordResetEmailNunjucksEnv.render(
    'emails/auth/password-reset-text.njk',
    data,
  ),
});

const buildPasswordResetPostmarkPayload = (data: {
  user: { id: string; email: string; name: string | null };
  resetTokenId: string;
  resetUrl: string;
}) => {
  const { htmlBody, textBody } = renderPasswordResetEmailBodies({
    resetUrl: data.resetUrl,
    user: data.user,
  });

  return {
    From: env.POSTMARK_FROM ?? '',
    To: data.user.email,
    Subject: 'Reset your Invoicing password',
    HtmlBody: htmlBody,
    TextBody: textBody,
    Tag: 'password-reset',
    Metadata: {
      userId: data.user.id,
      passwordResetTokenId: data.resetTokenId,
    },
    MessageStream: env.POSTMARK_MESSAGE_STREAM,
    TrackOpens: false,
    TrackLinks: 'None' as const,
  };
};

const postmarkPasswordResetProvider: SendPasswordResetEmail = async (
  payload,
) => {
  if (!env.POSTMARK_SERVER_TOKEN || !env.POSTMARK_FROM) {
    return {
      ok: false,
      errorMessage:
        'Postmark is not configured. Set POSTMARK_SERVER_TOKEN and POSTMARK_FROM.',
    };
  }

  try {
    const response = await fetch(env.POSTMARK_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify(payload),
    });
    const responseBody = (await response.json().catch(() => ({}))) as {
      MessageID?: string;
      SubmittedAt?: string;
      Message?: string;
      ErrorCode?: number;
    };

    if (!response.ok || responseBody.ErrorCode) {
      return {
        ok: false,
        errorMessage:
          responseBody.Message ??
          `Postmark returned HTTP ${response.status} while sending email.`,
        response: responseBody,
      };
    }

    if (!responseBody.MessageID) {
      return {
        ok: false,
        errorMessage: 'Postmark did not return a message id.',
        response: responseBody,
      };
    }

    return {
      ok: true,
      providerMessageId: responseBody.MessageID,
      submittedAt: responseBody.SubmittedAt,
      response: responseBody,
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage:
        error instanceof Error ? error.message : 'Unable to send reset email.',
    };
  }
};

export const registerUser = async (
  data: RegisterForm,
): Promise<RegisterUserResult> => {
  try {
    const passwordHash = await hashPassword(data.password);

    return await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: data.name || null,
          email: normalizeEmail(data.email),
          passwordHash,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: data.organizationName,
        },
      });

      await tx.organizationMembership.create({
        data: {
          userId: createdUser.id,
          organizationId: organization.id,
          role: 'OWNER',
        },
      });

      return {
        ok: true as const,
        userId: createdUser.id,
        organizationId: organization.id,
        sessionIdleTimeoutMinutes: defaultSessionIdleTimeoutMinutes,
        sessionAbsoluteLifetimeDays: defaultSessionAbsoluteLifetimeDays,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { ok: false, reason: 'emailAlreadyExists' };
    }

    if (isPrismaDatabaseError(error)) {
      return { ok: false, reason: 'databaseError' };
    }

    throw error;
  }
};

export const authenticateUser = async (data: {
  email: string;
  password: string;
}): Promise<AuthenticateUserResult> => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizeEmail(data.email) },
      include: {
        memberships: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          include: {
            organization: {
              select: {
                sessionIdleTimeoutMinutes: true,
                sessionAbsoluteLifetimeDays: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return { ok: false, reason: 'invalidCredentials' };
    }

    const isPasswordValid = await verifyPassword(
      data.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      return { ok: false, reason: 'invalidCredentials' };
    }

    const membership = user.memberships[0];

    if (!membership) {
      return { ok: false, reason: 'noOrganizationMembership' };
    }

    return {
      ok: true,
      userId: user.id,
      organizationId: membership.organizationId,
      sessionIdleTimeoutMinutes: membership.organization.sessionIdleTimeoutMinutes,
      sessionAbsoluteLifetimeDays: membership.organization.sessionAbsoluteLifetimeDays,
    };
  } catch (error) {
    if (isPrismaDatabaseError(error)) {
      return { ok: false, reason: 'databaseError' };
    }

    throw error;
  }
};

export const getInitialOrganizationForUser = async (
  userId: string,
): Promise<InitialOrganizationResult> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            organizationId: true,
            role: true,
          },
        },
      },
    });

    if (!user) {
      return { ok: false, reason: 'userNotFound' };
    }

    const membership = user.memberships[0];

    if (!membership) {
      return { ok: false, reason: 'noOrganizationMembership' };
    }

    return {
      ok: true,
      organizationId: membership.organizationId,
      role: membership.role,
    };
  } catch (error) {
    if (isPrismaDatabaseError(error)) {
      return { ok: false, reason: 'databaseError' };
    }

    throw error;
  }
};

export const requestPasswordReset = async (
  email: string,
  sendPasswordResetEmail: SendPasswordResetEmail = postmarkPasswordResetProvider,
): Promise<RequestPasswordResetResult> => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      return { ok: true, emailSent: false, tokenCreated: false };
    }

    const token = createPasswordResetToken();
    const resetToken = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: passwordResetExpiresAt(),
      },
    });
    const payload = buildPasswordResetPostmarkPayload({
      user,
      resetTokenId: resetToken.id,
      resetUrl: createPasswordResetUrl(token),
    });
    const sendResult = await sendPasswordResetEmail(payload);

    return {
      ok: true,
      emailSent: sendResult.ok,
      tokenCreated: true,
    };
  } catch (error) {
    if (isPrismaDatabaseError(error)) {
      return { ok: false, reason: 'databaseError' };
    }

    throw error;
  }
};

export const getValidPasswordResetToken = async (
  token: string,
): Promise<PasswordResetTokenResult> => {
  try {
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        usedAt: null,
        expiresAt: {
          gt: new Date(),
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

    if (!resetToken) {
      return { ok: false, reason: 'invalidOrExpired' };
    }

    return {
      ok: true,
      userId: resetToken.user.id,
      email: resetToken.user.email,
    };
  } catch (error) {
    if (isPrismaDatabaseError(error)) {
      return { ok: false, reason: 'databaseError' };
    }

    throw error;
  }
};

export const resetPasswordWithToken = async (
  token: string,
  password: string,
): Promise<ResetPasswordResult> => {
  try {
    const passwordHash = await hashPassword(password);
    const tokenHash = hashToken(token);

    return await prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findFirst({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!resetToken) {
        return { ok: false as const, reason: 'invalidOrExpired' as const };
      }

      const now = new Date();

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
          id: {
            not: resetToken.id,
          },
        },
        data: { usedAt: now },
      });

      return { ok: true as const };
    });
  } catch (error) {
    if (isPrismaDatabaseError(error)) {
      return { ok: false, reason: 'databaseError' };
    }

    throw error;
  }
};

export const changePassword = async (data: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  currentSessionId?: string;
}): Promise<ChangePasswordResult> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return { ok: false, reason: 'userNotFound' };
    }

    const isPasswordValid = await verifyPassword(
      data.currentPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      return { ok: false, reason: 'invalidCurrentPassword' };
    }

    const passwordHash = await hashPassword(data.newPassword);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: { usedAt: now },
      });

      await tx.session.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          ...(data.currentSessionId
            ? {
                id: {
                  not: data.currentSessionId,
                },
              }
            : {}),
        },
        data: { revokedAt: now },
      });
    });

    return { ok: true };
  } catch (error) {
    if (isPrismaDatabaseError(error)) {
      return { ok: false, reason: 'databaseError' };
    }

    throw error;
  }
};
