import type { Request, RequestHandler } from 'express';
import {
  type ForgotPasswordErrors,
  type ForgotPasswordValues,
  type ResetPasswordErrors,
  type RegisterErrors,
  type RegisterValues,
  forgotPasswordSchema,
  forgotPasswordValuesSchema,
  registerSchema,
  registerValuesSchema,
  resetPasswordSchema,
} from './auth.schema';
import * as authService from './auth.service';
import { applySessionMetadata } from '../../middleware/session-metadata';
import { daysToMs } from '../../lib/session-policy';

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

const renderForgotPasswordForm = (
  res: Parameters<RequestHandler>[1],
  values: Partial<ForgotPasswordValues> = {},
  errors: ForgotPasswordErrors = {},
  status = 200,
  success = false,
) =>
  res.status(status).render('pages/auth/forgot.njk', {
    title: 'Forgot password',
    values,
    errors,
    success,
  });

const renderResetPasswordForm = (
  res: Parameters<RequestHandler>[1],
  token: string,
  errors: ResetPasswordErrors = {},
  status = 200,
  invalidToken = false,
) =>
  res.status(status).render('pages/auth/reset.njk', {
    title: 'Reset password',
    token,
    errors,
    invalidToken,
  });

const getResetTokenParam = (req: Request) =>
  typeof req.params.token === 'string' ? req.params.token : '';

const getAuditContext = (req: Request) => ({
  ip: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
  sessionId: req.sessionID ?? null,
});

const getEmailForAudit = (value: unknown) =>
  typeof value === 'string' && value.trim()
    ? value.toLowerCase().trim()
    : null;

const recordAuditEvent = (data: Parameters<typeof authService.recordAuthAuditEvent>[0]) =>
  authService.recordAuthAuditEvent(data);

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

const assignAuthenticatedSession = (
  req: Request,
  sessionUser: authService.AuthSessionContext,
) => {
  applySessionMetadata(req);
  req.session.userId = sessionUser.userId;
  req.session.organizationId = sessionUser.organizationId;
  req.session.sessionIdleTimeoutMinutes = sessionUser.sessionIdleTimeoutMinutes;
  req.session.sessionAbsoluteLifetimeDays = sessionUser.sessionAbsoluteLifetimeDays;
  req.session.cookie.maxAge = daysToMs(sessionUser.sessionAbsoluteLifetimeDays);
};

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

export const renderForgotPassword: RequestHandler = (req, res) => {
  if (req.auth) {
    return res.redirect('/');
  }

  return renderForgotPasswordForm(res);
};

export const handleForgotPassword: RequestHandler = async (req, res, next) => {
  try {
    if (req.auth) {
      return res.redirect('/');
    }

    const result = forgotPasswordSchema.safeParse(req.body);
    const values = forgotPasswordValuesSchema.parse(req.body);

    if (!result.success) {
      return renderForgotPasswordForm(
        res,
        values,
        result.error.flatten().fieldErrors,
        422,
      );
    }

    const resetResult = await authService.requestPasswordReset(
      result.data.email,
    );

    if (!resetResult.ok) {
      return next(new Error('Unable to request password reset.'));
    }

    await recordAuditEvent({
      type: 'PASSWORD_RESET_REQUEST',
      email: result.data.email,
      ...getAuditContext(req),
      metadata: {
        emailSent: resetResult.emailSent,
        tokenCreated: resetResult.tokenCreated,
      },
    });

    return renderForgotPasswordForm(res, values, {}, 200, true);
  } catch (error) {
    return next(error);
  }
};

export const renderResetPassword: RequestHandler = async (req, res, next) => {
  try {
    if (req.auth) {
      return res.redirect('/');
    }

    const token = getResetTokenParam(req);

    if (!token) {
      return renderResetPasswordForm(res, '', {}, 404, true);
    }

    const resetToken = await authService.getValidPasswordResetToken(token);

    if (!resetToken.ok) {
      if (resetToken.reason === 'invalidOrExpired') {
        return renderResetPasswordForm(res, token, {}, 404, true);
      }

      return next(new Error('Unable to load password reset token.'));
    }

    return renderResetPasswordForm(res, token);
  } catch (error) {
    return next(error);
  }
};

export const handleResetPassword: RequestHandler = async (req, res, next) => {
  try {
    if (req.auth) {
      return res.redirect('/');
    }

    const token = getResetTokenParam(req);

    if (!token) {
      return renderResetPasswordForm(res, '', {}, 404, true);
    }

    const result = resetPasswordSchema.safeParse(req.body);

    if (!result.success) {
      return renderResetPasswordForm(
        res,
        token,
        result.error.flatten().fieldErrors,
        422,
      );
    }

    const resetResult = await authService.resetPasswordWithToken(
      token,
      result.data.password,
    );

    if (!resetResult.ok) {
      if (resetResult.reason === 'invalidOrExpired') {
        return renderResetPasswordForm(res, token, {}, 404, true);
      }

      return next(new Error('Unable to reset password.'));
    }

    await recordAuditEvent({
      type: 'PASSWORD_RESET_COMPLETED',
      userId: resetResult.userId,
      ...getAuditContext(req),
    });

    req.flash('success', 'Password reset successfully. Please log in.');

    return res.redirect('/auth/login');
  } catch (error) {
    return next(error);
  }
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

    assignAuthenticatedSession(req, sessionUser);

    req.flash('success', 'Account created successfully.');

    return res.redirect('/');
  } catch (error) {
    return next(error);
  }
};

export const loginUser: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const auditEmail = getEmailForAudit(email);

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      await recordAuditEvent({
        type: 'LOGIN_FAILURE',
        email: auditEmail,
        ...getAuditContext(req),
        metadata: { reason: 'missingCredentials' },
      });
      req.flash('error', 'Email and password are required.');
      return res.redirect('/auth/login');
    }

    const sessionUser = await authService.authenticateUser({ email, password });

    if (!sessionUser.ok && sessionUser.reason === 'invalidCredentials') {
      await recordAuditEvent({
        type: 'LOGIN_FAILURE',
        email: auditEmail,
        ...getAuditContext(req),
        metadata: { reason: 'invalidCredentials' },
      });
      req.flash('error', 'Incorrect credentials.');
      return res.redirect('/auth/login');
    }

    if (!sessionUser.ok && sessionUser.reason === 'noOrganizationMembership') {
      await recordAuditEvent({
        type: 'LOGIN_FAILURE',
        email: auditEmail,
        ...getAuditContext(req),
        metadata: { reason: 'noOrganizationMembership' },
      });
      req.flash('error', 'This account is not connected to an organization.');
      return res.redirect('/auth/login');
    }

    if (!sessionUser.ok) {
      return next(new Error('Unable to log in.'));
    }

    await regenerateSession(req);

    assignAuthenticatedSession(req, sessionUser);

    await recordAuditEvent({
      type: 'LOGIN_SUCCESS',
      userId: sessionUser.userId,
      organizationId: sessionUser.organizationId,
      email: auditEmail,
      ...getAuditContext(req),
    });

    return res.redirect('/');
  } catch (error) {
    return next(error);
  }
};

export const logoutUser: RequestHandler = async (req, res, next) => {
  try {
    await recordAuditEvent({
      type: 'LOGOUT',
      userId: req.session.userId ?? null,
      organizationId: req.session.organizationId ?? null,
      ...getAuditContext(req),
    });

    await destroySession(req);
    res.clearCookie('invoice.sid');

    return res.redirect('/auth/login');
  } catch (error) {
    return next(error);
  }
};
