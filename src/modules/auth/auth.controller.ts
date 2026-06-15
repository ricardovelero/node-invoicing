import type { Request, RequestHandler } from 'express';
import {
  type ForgotPasswordErrors,
  type ForgotPasswordValues,
  type LoginErrors,
  type LoginValues,
  type ResetPasswordErrors,
  type RegisterErrors,
  type RegisterValues,
  forgotPasswordSchema,
  forgotPasswordValuesSchema,
  loginSchema,
  loginValuesSchema,
  registerSchema,
  registerValuesSchema,
  resetPasswordSchema,
} from './auth.schema';
import * as authService from './auth.service';
import { applySessionMetadata } from '../../middleware/session-metadata';
import { daysToMs } from '../../lib/session-policy';

const renderRegisterForm = (
  req: Request,
  res: Parameters<RequestHandler>[1],
  values: Partial<RegisterValues> = {},
  errors: RegisterErrors = {},
  status = 200,
) =>
  res.status(status).render('pages/auth/register.njk', {
    title: req.t('auth.register.heading'),
    values,
    errors,
  });

const renderForgotPasswordForm = (
  req: Request,
  res: Parameters<RequestHandler>[1],
  values: Partial<ForgotPasswordValues> = {},
  errors: ForgotPasswordErrors = {},
  status = 200,
  success = false,
) =>
  res.status(status).render('pages/auth/forgot.njk', {
    title: req.t('auth.forgot.heading'),
    values,
    errors,
    success,
  });

const renderResetPasswordForm = (
  req: Request,
  res: Parameters<RequestHandler>[1],
  token: string,
  errors: ResetPasswordErrors = {},
  status = 200,
  invalidToken = false,
) =>
  res.status(status).render('pages/auth/reset.njk', {
    title: req.t('auth.reset.heading'),
    token,
    errors,
    invalidToken,
  });

const renderLoginForm = (
  req: Request,
  res: Parameters<RequestHandler>[1],
  values: Partial<LoginValues> = {},
  errors: LoginErrors = {},
  status = 200,
) =>
  res.status(status).render('pages/auth/login.njk', {
    title: req.t('auth.login.heading'),
    values,
    errors,
  });

const getResetTokenParam = (req: Request) =>
  typeof req.params.token === 'string' ? req.params.token : '';

const pushFlashError = (
  res: Parameters<RequestHandler>[1],
  message: string,
) => {
  const flash = (res.locals.flash ??= { success: [], error: [] });
  flash.error.push(message);
};

export const renderLoginRateLimited: RequestHandler = (req, res) => {
  pushFlashError(res, req.t('auth.flash.rateLimited'));
  return renderLoginForm(req, res, {}, {}, 429);
};

export const renderRegisterRateLimited: RequestHandler = (req, res) => {
  pushFlashError(res, req.t('auth.flash.rateLimited'));
  return renderRegisterForm(req, res, {}, {}, 429);
};

export const renderForgotPasswordRateLimited: RequestHandler = (req, res) => {
  pushFlashError(res, req.t('auth.flash.rateLimited'));
  return renderForgotPasswordForm(req, res, {}, {}, 429);
};

export const renderResetPasswordRateLimited: RequestHandler = (req, res) => {
  pushFlashError(res, req.t('auth.flash.rateLimited'));
  return renderResetPasswordForm(req, res, getResetTokenParam(req), {}, 429);
};

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

  return renderRegisterForm(req, res);
};

export const renderLogin: RequestHandler = (req, res) => {
  if (req.auth) {
    return res.redirect('/');
  }

  return renderLoginForm(req, res);
};

export const renderForgotPassword: RequestHandler = (req, res) => {
  if (req.auth) {
    return res.redirect('/');
  }

  return renderForgotPasswordForm(req, res);
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
        req,
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

    return renderForgotPasswordForm(req, res, values, {}, 200, true);
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
      return renderResetPasswordForm(req, res, '', {}, 404, true);
    }

    const resetToken = await authService.getValidPasswordResetToken(token);

    if (!resetToken.ok) {
      if (resetToken.reason === 'invalidOrExpired') {
        return renderResetPasswordForm(req, res, token, {}, 404, true);
      }

      return next(new Error('Unable to load password reset token.'));
    }

    return renderResetPasswordForm(req, res, token);
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
      return renderResetPasswordForm(req, res, '', {}, 404, true);
    }

    const result = resetPasswordSchema.safeParse(req.body);

    if (!result.success) {
      return renderResetPasswordForm(
        req,
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
        return renderResetPasswordForm(req, res, token, {}, 404, true);
      }

      return next(new Error('Unable to reset password.'));
    }

    await recordAuditEvent({
      type: 'PASSWORD_RESET_COMPLETED',
      userId: resetResult.userId,
      ...getAuditContext(req),
    });

    req.flash('success', req.t('auth.flash.passwordReset'));

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
      return renderRegisterForm(
        req,
        res,
        values,
        result.error.flatten().fieldErrors,
        422,
      );
    }

    const sessionUser = await authService.registerUser(result.data);

    if (!sessionUser.ok) {
      if (sessionUser.reason === 'emailAlreadyExists') {
        return renderRegisterForm(
          req,
          res,
          values,
          { email: [req.t('auth.errors.emailAlreadyExists')] },
          409,
        );
      }

      return next(new Error('Unable to create account.'));
    }

    await regenerateSession(req);

    assignAuthenticatedSession(req, sessionUser);

    req.flash('success', req.t('auth.flash.accountCreated'));

    return res.redirect('/');
  } catch (error) {
    return next(error);
  }
};

export const loginUser: RequestHandler = async (req, res, next) => {
  try {
    const result = loginSchema.safeParse(req.body);
    const values = loginValuesSchema.parse(req.body);
    const auditEmail = getEmailForAudit(req.body.email);

    if (!result.success) {
      await recordAuditEvent({
        type: 'LOGIN_FAILURE',
        email: auditEmail,
        ...getAuditContext(req),
        metadata: { reason: 'missingCredentials' },
      });
      return renderLoginForm(
        req,
        res,
        values,
        result.error.flatten().fieldErrors,
        422,
      );
    }

    const sessionUser = await authService.authenticateUser(result.data);

    if (!sessionUser.ok && sessionUser.reason === 'invalidCredentials') {
      await recordAuditEvent({
        type: 'LOGIN_FAILURE',
        email: auditEmail,
        ...getAuditContext(req),
        metadata: { reason: 'invalidCredentials' },
      });
      pushFlashError(res, req.t('auth.flash.invalidCredentials'));
      return renderLoginForm(req, res, values, {}, 401);
    }

    if (!sessionUser.ok && sessionUser.reason === 'noOrganizationMembership') {
      await recordAuditEvent({
        type: 'LOGIN_FAILURE',
        email: auditEmail,
        ...getAuditContext(req),
        metadata: { reason: 'noOrganizationMembership' },
      });
      pushFlashError(res, req.t('auth.flash.noOrganizationMembership'));
      return renderLoginForm(req, res, values, {}, 401);
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
