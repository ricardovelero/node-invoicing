import { Prisma, type OrganizationRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../../db/prisma';
import type { RegisterForm } from './auth.schema';

export type AuthSessionContext = {
  userId: string;
  organizationId: string;
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

const normalizeEmail = (email: string) => email.toLowerCase().trim();

const hashPassword = (password: string) => bcrypt.hash(password, 12);

const verifyPassword = (password: string, passwordHash: string) =>
  bcrypt.compare(password, passwordHash);

const isPrismaDatabaseError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError ||
  error instanceof Prisma.PrismaClientUnknownRequestError ||
  error instanceof Prisma.PrismaClientRustPanicError ||
  error instanceof Prisma.PrismaClientInitializationError;

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
