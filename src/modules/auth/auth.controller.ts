import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { Request, RequestHandler } from 'express';
import { prisma } from '../../db/prisma';

type RegisterValues = {
  name: string;
  email: string;
  organizationName: string;
};

type RegisterErrors = Partial<Record<'email' | 'password' | 'organizationName', string[]>>;

const passwordRequirementsMessage =
  'Use at least 8 characters with uppercase, lowercase and a number.';

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isStrongPassword = (password: string) =>
  password.length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password);

const getRegisterValues = (body: Request['body']): RegisterValues => ({
  name: typeof body.name === 'string' ? body.name.trim() : '',
  email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
  organizationName:
    typeof body.organizationName === 'string' ? body.organizationName.trim() : '',
});

const validateRegisterRequest = (body: Request['body']) => {
  const values = getRegisterValues(body);
  const password = typeof body.password === 'string' ? body.password : '';
  const errors: RegisterErrors = {};

  if (!values.email) {
    errors.email = ['Enter your email address.'];
  } else if (!isValidEmail(values.email)) {
    errors.email = ['Enter a valid email address.'];
  }

  if (!password) {
    errors.password = ['Enter your password.'];
  } else if (!isStrongPassword(password)) {
    errors.password = [passwordRequirementsMessage];
  }

  if (!values.organizationName) {
    errors.organizationName = ['Enter your organization name.'];
  }

  return { values, password, errors };
};

const hasRegisterErrors = (errors: RegisterErrors) => Object.keys(errors).length > 0;

const renderRegisterForm = (
  res: Parameters<RequestHandler>[1],
  values: Partial<RegisterValues> = {},
  errors: RegisterErrors = {},
  status = 200,
) =>
  res.status(status).render('pages/auth/register.njk', {
    title: 'Create account',
    values,
    errors,
  });

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

const destroySession = (req: Request) =>
  new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

export const renderRegister: RequestHandler = (req, res) => {
  if (req.auth) {
    return res.redirect('/');
  }

  return renderRegisterForm(res);
};

export const renderLogin: RequestHandler = (req, res) => {
  if (req.auth) {
    return res.redirect('/');
  }

  res.render('pages/auth/login.njk', {
    title: 'Log in',
    values: {},
  });
};

export const registerUser: RequestHandler = async (req, res, next) => {
  try {
    const { values, password, errors } = validateRegisterRequest(req.body);

    if (hasRegisterErrors(errors)) {
      return renderRegisterForm(res, values, errors, 422);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const sessionUser = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: values.name || null,
          email: values.email,
          passwordHash,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: values.organizationName,
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
        userId: createdUser.id,
        organizationId: organization.id,
      };
    });

    await regenerateSession(req);

    req.session.userId = sessionUser.userId;
    req.session.organizationId = sessionUser.organizationId;

    req.flash('success', 'Account created successfully.');

    return res.redirect('/');
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return renderRegisterForm(
        res,
        getRegisterValues(req.body),
        { email: ['An account with this email already exists.'] },
        409,
      );
    }

    return next(error);
  }
};

export const loginUser: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      req.flash('error', 'Email and password are required.');
      return res.redirect('/auth/login');
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        memberships: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!user) {
      req.flash('error', 'Incorrect credentials.');
      return res.redirect('/auth/login');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      req.flash('error', 'Incorrect credentials.');
      return res.redirect('/auth/login');
    }

    const membership = user.memberships[0];

    if (!membership) {
      req.flash('error', 'This account is not connected to an organization.');
      return res.redirect('/auth/login');
    }

    await regenerateSession(req);

    req.session.userId = user.id;
    req.session.organizationId = membership.organizationId;

    return res.redirect('/');
  } catch (error) {
    return next(error);
  }
};

export const logoutUser: RequestHandler = async (req, res, next) => {
  try {
    await destroySession(req);
    res.clearCookie('invoice.sid');

    return res.redirect('/auth/login');
  } catch (error) {
    return next(error);
  }
};
