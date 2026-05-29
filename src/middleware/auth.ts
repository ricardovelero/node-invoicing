import type { Organization, OrganizationRole, User } from "@prisma/client";
import type { RequestHandler } from "express";
import { prisma } from "../db/prisma";

type CurrentUser = Pick<User, "id" | "email" | "name">;
type CurrentOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "legalName"
  | "taxId"
  | "addressLine1"
  | "city"
  | "country"
  | "currency"
  | "paymentInstructions"
>;

export type AuthContext = {
  user: CurrentUser;
  organization: CurrentOrganization;
  role: OrganizationRole;
};

declare module "express-session" {
  interface SessionData {
    userId?: string;
    organizationId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export const loadAuthContext: RequestHandler = async (req, res, next) => {
  const { userId, organizationId } = req.session;

  res.locals.currentUser = null;
  res.locals.currentOrganization = null;

  if (!userId) {
    return next();
  }

  try {
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        userId,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            legalName: true,
            taxId: true,
            addressLine1: true,
            city: true,
            country: true,
            currency: true,
            paymentInstructions: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      delete req.session.userId;
      delete req.session.organizationId;
      return next();
    }

    req.session.organizationId = membership.organizationId;
    req.auth = {
      user: membership.user,
      organization: membership.organization,
      role: membership.role,
    };

    res.locals.currentUser = req.auth.user;
    res.locals.currentOrganization = req.auth.organization;

    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.auth) {
    req.flash("error", "Please log in to continue.");
    return res.redirect("/auth/login");
  }

  return next();
};

export const requireOrganizationRole = (roles: OrganizationRole[]): RequestHandler => {
  const allowedRoles = new Set<OrganizationRole>(roles);

  return (req, _res, next) => {
    if (!req.auth || !allowedRoles.has(req.auth.role)) {
      return next(
        Object.assign(new Error("You do not have permission to edit organization settings."), {
          status: 403,
        }),
      );
    }

    return next();
  };
};
