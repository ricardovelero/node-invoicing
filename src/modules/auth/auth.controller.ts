import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { Request, RequestHandler } from "express";
import { prisma } from "../../db/prisma";

const regenerateSession = (req: Request) =>
  new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

export const renderRegister: RequestHandler = (_req, res) => {
  res.render("pages/auth/register.njk", {
    title: "Create account",
    values: {},
  });
};

export const registerUser: RequestHandler = async (req, res, next) => {
  try {
    const { name, email, password, organizationName } = req.body;

    if (!email || !password || !organizationName) {
      req.flash("error", "Email, password and organization name are required.");
      return res.redirect("/auth/register");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const sessionUser = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: name?.trim() || null,
          email: email.toLowerCase().trim(),
          passwordHash,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: organizationName.trim(),
        },
      });

      await tx.organizationMembership.create({
        data: {
          userId: createdUser.id,
          organizationId: organization.id,
          role: "OWNER",
        },
      });

      return {
        userId: createdUser.id,
        organizationId: organization.id,
      };
    });

    await regenerateSession(req);

    req.session.userId = sessionUser.userId;
    req.session.organizationId = sessionUser.organizationId;

    req.flash("success", "Account created successfully.");

    return res.redirect("/");
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      req.flash("error", "An account with this email already exists.");
      return res.redirect("/auth/register");
    }

    return next(error);
  }
};
