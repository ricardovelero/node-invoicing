import type { Request, RequestHandler } from 'express';
import {
  type RegisterErrors,
  type RegisterValues,
  registerSchema,
  registerValuesSchema,
} from './auth.schema';
import * as authService from './auth.service';

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

export const handleRegister: RequestHandler = async (req, res, next) => {
  try {
    const result = registerSchema.safeParse(req.body);
    const values = registerValuesSchema.parse(req.body);

    if (!result.success) {
      return renderRegisterForm(res, values, result.error.flatten().fieldErrors, 422);
    }

    const sessionUser = await authService.registerUser(result.data);

    if (!sessionUser.ok) {
      if (sessionUser.reason === 'emailAlreadyExists') {
        return renderRegisterForm(
          res,
          values,
          { email: ['An account with this email already exists.'] },
          409,
        );
      }

      return next(new Error('Unable to create account.'));
    }

    await regenerateSession(req);

    req.session.userId = sessionUser.userId;
    req.session.organizationId = sessionUser.organizationId;

    req.flash('success', 'Account created successfully.');

    return res.redirect('/');
  } catch (error) {
    return next(error);
  }
};

export const loginUser: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      req.flash('error', 'Email and password are required.');
      return res.redirect('/auth/login');
    }

    const sessionUser = await authService.authenticateUser({ email, password });

    if (!sessionUser.ok && sessionUser.reason === 'invalidCredentials') {
      req.flash('error', 'Incorrect credentials.');
      return res.redirect('/auth/login');
    }

    if (!sessionUser.ok && sessionUser.reason === 'noOrganizationMembership') {
      req.flash('error', 'This account is not connected to an organization.');
      return res.redirect('/auth/login');
    }

    if (!sessionUser.ok) {
      return next(new Error('Unable to log in.'));
    }

    await regenerateSession(req);

    req.session.userId = sessionUser.userId;
    req.session.organizationId = sessionUser.organizationId;

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
