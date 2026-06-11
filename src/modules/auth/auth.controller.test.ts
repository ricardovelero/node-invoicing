import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import {
  handleForgotPassword,
  handleRegister,
  handleResetPassword,
  loginUser,
  logoutUser,
  renderForgotPassword,
  renderLoginRateLimited,
  renderResetPassword,
} from "./auth.controller";
import * as authService from "./auth.service";

type MockSession = {
  userId?: string;
  organizationId?: string;
  sessionIdleTimeoutMinutes?: number;
  sessionAbsoluteLifetimeDays?: number;
  userAgent?: string;
  ip?: string;
  cookie: {
    maxAge?: number;
  };
  regenerateCalls: number;
  destroyCalls: number;
  regenerate: (callback: (error?: Error) => void) => void;
  destroy: (callback: (error?: Error) => void) => void;
};

type MockRequest = Request & {
  body: Record<string, unknown>;
  params: Record<string, string>;
  session: MockSession;
  flashMessages: Record<string, string[]>;
};

type MockResponse = Response & {
  statusCode?: number;
  redirectedTo?: string;
  renderedView?: string;
  renderedData?: unknown;
  clearedCookies: string[];
};

const authServiceMock = authService as unknown as {
  registerUser: typeof authService.registerUser;
  authenticateUser: typeof authService.authenticateUser;
  requestPasswordReset: typeof authService.requestPasswordReset;
  getValidPasswordResetToken: typeof authService.getValidPasswordResetToken;
  resetPasswordWithToken: typeof authService.resetPasswordWithToken;
  recordAuthAuditEvent: typeof authService.recordAuthAuditEvent;
};

const originalRegisterUser = authServiceMock.registerUser;
const originalAuthenticateUser = authServiceMock.authenticateUser;
const originalRequestPasswordReset = authServiceMock.requestPasswordReset;
const originalGetValidPasswordResetToken = authServiceMock.getValidPasswordResetToken;
const originalResetPasswordWithToken = authServiceMock.resetPasswordWithToken;
const originalRecordAuthAuditEvent = authServiceMock.recordAuthAuditEvent;
let auditEvents: Array<Parameters<typeof authService.recordAuthAuditEvent>[0]> = [];

beforeEach(() => {
  auditEvents = [];
  authServiceMock.recordAuthAuditEvent = async (event) => {
    auditEvents.push(event);
    return { ok: true };
  };
});

afterEach(() => {
  authServiceMock.registerUser = originalRegisterUser;
  authServiceMock.authenticateUser = originalAuthenticateUser;
  authServiceMock.requestPasswordReset = originalRequestPasswordReset;
  authServiceMock.getValidPasswordResetToken = originalGetValidPasswordResetToken;
  authServiceMock.resetPasswordWithToken = originalResetPasswordWithToken;
  authServiceMock.recordAuthAuditEvent = originalRecordAuthAuditEvent;
});

const createRequest = (
  body: Record<string, unknown> = {},
  params: Record<string, string> = {},
) => {
  const session: MockSession = {
    cookie: {},
    regenerateCalls: 0,
    destroyCalls: 0,
    regenerate(callback) {
      this.regenerateCalls += 1;
      callback();
    },
    destroy(callback) {
      this.destroyCalls += 1;
      delete this.userId;
      delete this.organizationId;
      callback();
    },
  };

  const req = {
    body,
    params,
    session,
    flashMessages: {},
    ip: "203.0.113.10",
    get(name: string) {
      return name.toLowerCase() === "user-agent" ? "Test Browser" : undefined;
    },
    flash(type: string, message: string) {
      this.flashMessages[type] ??= [];
      this.flashMessages[type].push(message);
      return this.flashMessages[type];
    },
    sessionID: "sid_current",
  } as MockRequest;

  return req;
};

const createResponse = () => {
  const res: {
    redirectedTo?: string;
    statusCode?: number;
    renderedView?: string;
    renderedData?: unknown;
    clearedCookies: string[];
    status?: (statusCode: number) => MockResponse;
    redirect?: (path: string) => MockResponse;
    render?: (view: string, data: unknown) => MockResponse;
    clearCookie?: (name: string) => MockResponse;
  } = {
    clearedCookies: [],
  };
  res.status = (statusCode: number) => {
    res.statusCode = statusCode;
    return res as unknown as MockResponse;
  };
  res.redirect = (path: string) => {
    res.redirectedTo = path;
    return res as unknown as MockResponse;
  };
  res.render = (view: string, data: unknown) => {
    res.renderedView = view;
    res.renderedData = data;
    return res as unknown as MockResponse;
  };
  res.clearCookie = (name: string) => {
    res.clearedCookies.push(name);
    return res as unknown as MockResponse;
  };

  return res as unknown as MockResponse;
};

const createNext = () => {
  let error: unknown;
  const next: NextFunction = (nextError?: unknown) => {
    error = nextError;
  };

  return {
    next,
    get error() {
      return error;
    },
  };
};

test("handleRegister stores the service result in session after creating an account", async () => {
  let serviceData: unknown;
  authServiceMock.registerUser = async (data) => {
    serviceData = data;
    return {
      ok: true,
      userId: "user_1",
      organizationId: "org_1",
      sessionIdleTimeoutMinutes: 30,
      sessionAbsoluteLifetimeDays: 14,
    };
  };

  const req = createRequest({
    name: " Ada Lovelace ",
    email: " ADA@example.COM ",
    password: "CorrectPassword1",
    organizationName: " Analytical Engines ",
  });
  const res = createResponse();
  const next = createNext();

  await handleRegister(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.deepEqual(serviceData, {
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "CorrectPassword1",
    organizationName: "Analytical Engines",
  });
  assert.equal(req.session.regenerateCalls, 1);
  assert.equal(req.session.userId, "user_1");
  assert.equal(req.session.organizationId, "org_1");
  assert.equal(req.session.sessionIdleTimeoutMinutes, 30);
  assert.equal(req.session.sessionAbsoluteLifetimeDays, 14);
  assert.equal(req.session.cookie.maxAge, 14 * 24 * 60 * 60 * 1000);
  assert.equal(req.session.userAgent, "Test Browser");
  assert.equal(req.session.ip, "203.0.113.10");
  assert.deepEqual(req.flashMessages.success, ["Account created successfully."]);
  assert.equal(res.redirectedTo, "/");
});

test("handleRegister rejects weak passwords and missing organization before creating records", async () => {
  let serviceCalls = 0;

  authServiceMock.registerUser = async () => {
    serviceCalls += 1;
    return {
      ok: true,
      userId: "user_1",
      organizationId: "org_1",
      sessionIdleTimeoutMinutes: 30,
      sessionAbsoluteLifetimeDays: 14,
    };
  };

  const req = createRequest({
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "weak",
    organizationName: " ",
  });
  const res = createResponse();
  const next = createNext();

  await handleRegister(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(serviceCalls, 0);
  assert.equal(req.session.regenerateCalls, 0);
  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/auth/register.njk");
  assert.deepEqual(res.renderedData, {
    title: "Create account",
    values: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      organizationName: "",
    },
    errors: {
      password: ["Use at least 8 characters with uppercase, lowercase and a number."],
      organizationName: ["Enter your organization name."],
    },
  });
});

test("handleRegister renders duplicate email errors returned by the service", async () => {
  authServiceMock.registerUser = async () => ({
    ok: false,
    reason: "emailAlreadyExists",
  });

  const req = createRequest({
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "CorrectPassword1",
    organizationName: "Analytical Engines",
  });
  const res = createResponse();
  const next = createNext();

  await handleRegister(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(req.session.regenerateCalls, 0);
  assert.equal(res.statusCode, 409);
  assert.equal(res.renderedView, "pages/auth/register.njk");
  assert.deepEqual(res.renderedData, {
    title: "Create account",
    values: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      organizationName: "Analytical Engines",
    },
    errors: {
      email: ["An account with this email already exists."],
    },
  });
});

test("renderForgotPassword renders the forgot password form", () => {
  const req = createRequest();
  const res = createResponse();
  const next = createNext();

  renderForgotPassword(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.renderedView, "pages/auth/forgot.njk");
  assert.deepEqual(res.renderedData, {
    title: "Forgot password",
    values: {},
    errors: {},
    success: false,
  });
});

test("renderLoginRateLimited re-renders the login page with a 429 and a flash error", () => {
  const req = createRequest();
  const res = createResponse();
  res.locals = { flash: { success: [], error: [] } };
  const next = createNext();

  renderLoginRateLimited(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(res.statusCode, 429);
  assert.equal(res.renderedView, "pages/auth/login.njk");
  assert.deepEqual(res.renderedData, { title: "Log in", values: {} });
  assert.deepEqual(res.locals.flash.error, [
    "Too many attempts. Please wait a moment and try again.",
  ]);
});

test("handleForgotPassword validates email before requesting a reset", async () => {
  let serviceCalls = 0;

  authServiceMock.requestPasswordReset = async () => {
    serviceCalls += 1;
    return { ok: true, emailSent: true, tokenCreated: true };
  };

  const req = createRequest({ email: "not-an-email" });
  const res = createResponse();
  const next = createNext();

  await handleForgotPassword(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(serviceCalls, 0);
  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/auth/forgot.njk");
  assert.deepEqual(res.renderedData, {
    title: "Forgot password",
    values: { email: "not-an-email" },
    errors: {
      email: ["Enter a valid email address."],
    },
    success: false,
  });
});

test("handleForgotPassword renders a generic success message after valid requests", async () => {
  let serviceEmail: string | undefined;

  authServiceMock.requestPasswordReset = async (email) => {
    serviceEmail = email;
    return { ok: true, emailSent: false, tokenCreated: false };
  };

  const req = createRequest({ email: " ADA@example.COM " });
  const res = createResponse();
  const next = createNext();

  await handleForgotPassword(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(serviceEmail, "ada@example.com");
  assert.equal(res.statusCode, 200);
  assert.equal(res.renderedView, "pages/auth/forgot.njk");
  assert.deepEqual(res.renderedData, {
    title: "Forgot password",
    values: { email: "ada@example.com" },
    errors: {},
    success: true,
  });
  assert.deepEqual(auditEvents, [
    {
      type: "PASSWORD_RESET_REQUEST",
      email: "ada@example.com",
      ip: "203.0.113.10",
      userAgent: "Test Browser",
      sessionId: "sid_current",
      metadata: {
        emailSent: false,
        tokenCreated: false,
      },
    },
  ]);
});

test("renderResetPassword renders the reset form for valid tokens", async () => {
  authServiceMock.getValidPasswordResetToken = async () => ({
    ok: true,
    userId: "user_1",
    email: "ada@example.com",
  });

  const req = createRequest({}, { token: "valid-token" });
  const res = createResponse();
  const next = createNext();

  await renderResetPassword(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.renderedView, "pages/auth/reset.njk");
  assert.deepEqual(res.renderedData, {
    title: "Reset password",
    token: "valid-token",
    errors: {},
    invalidToken: false,
  });
});

test("renderResetPassword renders an invalid link state for expired tokens", async () => {
  authServiceMock.getValidPasswordResetToken = async () => ({
    ok: false,
    reason: "invalidOrExpired",
  });

  const req = createRequest({}, { token: "expired-token" });
  const res = createResponse();
  const next = createNext();

  await renderResetPassword(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/auth/reset.njk");
  assert.deepEqual(res.renderedData, {
    title: "Reset password",
    token: "expired-token",
    errors: {},
    invalidToken: true,
  });
});

test("handleResetPassword validates password without rendering password values back", async () => {
  let serviceCalls = 0;

  authServiceMock.resetPasswordWithToken = async () => {
    serviceCalls += 1;
    return { ok: true, userId: "user_1" };
  };

  const req = createRequest({ password: "weak" }, { token: "valid-token" });
  const res = createResponse();
  const next = createNext();

  await handleResetPassword(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(serviceCalls, 0);
  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/auth/reset.njk");
  assert.deepEqual(res.renderedData, {
    title: "Reset password",
    token: "valid-token",
    errors: {
      password: ["Use at least 8 characters with uppercase, lowercase and a number."],
    },
    invalidToken: false,
  });
  assert.equal(JSON.stringify(res.renderedData).includes("weak"), false);
});

test("handleResetPassword consumes valid tokens and redirects to login", async () => {
  let serviceData: unknown;

  authServiceMock.resetPasswordWithToken = async (token, password) => {
    serviceData = { token, password };
    return { ok: true, userId: "user_1" };
  };

  const req = createRequest(
    { password: "CorrectPassword1" },
    { token: "valid-token" },
  );
  const res = createResponse();
  const next = createNext();

  await handleResetPassword(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.deepEqual(serviceData, {
    token: "valid-token",
    password: "CorrectPassword1",
  });
  assert.deepEqual(req.flashMessages.success, [
    "Password reset successfully. Please log in.",
  ]);
  assert.equal(res.redirectedTo, "/auth/login");
  assert.deepEqual(auditEvents, [
    {
      type: "PASSWORD_RESET_COMPLETED",
      userId: "user_1",
      ip: "203.0.113.10",
      userAgent: "Test Browser",
      sessionId: "sid_current",
    },
  ]);
});

test("handleResetPassword renders invalid link state when the service rejects a token", async () => {
  authServiceMock.resetPasswordWithToken = async () => ({
    ok: false,
    reason: "invalidOrExpired",
  });

  const req = createRequest(
    { password: "CorrectPassword1" },
    { token: "expired-token" },
  );
  const res = createResponse();
  const next = createNext();

  await handleResetPassword(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/auth/reset.njk");
  assert.deepEqual(res.renderedData, {
    title: "Reset password",
    token: "expired-token",
    errors: {},
    invalidToken: true,
  });
});

test("loginUser stores the authenticated service result in session", async () => {
  let serviceData: unknown;

  authServiceMock.authenticateUser = async (data) => {
    serviceData = data;
    return {
      ok: true,
      userId: "user_1",
      organizationId: "org_1",
      sessionIdleTimeoutMinutes: 45,
      sessionAbsoluteLifetimeDays: 21,
    };
  };

  const req = createRequest({
    email: " ADA@example.COM ",
    password: "correct-password",
  });
  const res = createResponse();
  const next = createNext();

  await loginUser(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.deepEqual(serviceData, {
    email: " ADA@example.COM ",
    password: "correct-password",
  });
  assert.equal(req.session.regenerateCalls, 1);
  assert.equal(req.session.userId, "user_1");
  assert.equal(req.session.organizationId, "org_1");
  assert.equal(req.session.sessionIdleTimeoutMinutes, 45);
  assert.equal(req.session.sessionAbsoluteLifetimeDays, 21);
  assert.equal(req.session.cookie.maxAge, 21 * 24 * 60 * 60 * 1000);
  assert.equal(req.session.userAgent, "Test Browser");
  assert.equal(req.session.ip, "203.0.113.10");
  assert.equal(res.redirectedTo, "/");
  assert.deepEqual(auditEvents, [
    {
      type: "LOGIN_SUCCESS",
      userId: "user_1",
      organizationId: "org_1",
      email: "ada@example.com",
      ip: "203.0.113.10",
      userAgent: "Test Browser",
      sessionId: "sid_current",
    },
  ]);
});

test("loginUser rejects invalid credentials without creating a session", async () => {
  authServiceMock.authenticateUser = async () => ({
    ok: false,
    reason: "invalidCredentials",
  });

  const req = createRequest({
    email: "ada@example.com",
    password: "wrong-password",
  });
  const res = createResponse();
  const next = createNext();

  await loginUser(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(req.session.regenerateCalls, 0);
  assert.equal(req.session.userId, undefined);
  assert.equal(req.session.organizationId, undefined);
  assert.deepEqual(req.flashMessages.error, ["Incorrect credentials."]);
  assert.equal(res.redirectedTo, "/auth/login");
  assert.deepEqual(auditEvents, [
    {
      type: "LOGIN_FAILURE",
      email: "ada@example.com",
      ip: "203.0.113.10",
      userAgent: "Test Browser",
      sessionId: "sid_current",
      metadata: {
        reason: "invalidCredentials",
      },
    },
  ]);
});

test("loginUser rejects accounts without an organization membership", async () => {
  authServiceMock.authenticateUser = async () => ({
    ok: false,
    reason: "noOrganizationMembership",
  });

  const req = createRequest({
    email: "ada@example.com",
    password: "correct-password",
  });
  const res = createResponse();
  const next = createNext();

  await loginUser(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(req.session.regenerateCalls, 0);
  assert.equal(req.session.userId, undefined);
  assert.equal(req.session.organizationId, undefined);
  assert.deepEqual(req.flashMessages.error, [
    "This account is not connected to an organization.",
  ]);
  assert.equal(res.redirectedTo, "/auth/login");
  assert.deepEqual(auditEvents, [
    {
      type: "LOGIN_FAILURE",
      email: "ada@example.com",
      ip: "203.0.113.10",
      userAgent: "Test Browser",
      sessionId: "sid_current",
      metadata: {
        reason: "noOrganizationMembership",
      },
    },
  ]);
});

test("logoutUser destroys the session, clears the session cookie, and redirects to login", async () => {
  const req = createRequest();
  req.session.userId = "user_1";
  req.session.organizationId = "org_1";
  const res = createResponse();
  const next = createNext();

  await logoutUser(req, res, next.next);

  assert.equal(next.error, undefined);
  assert.equal(req.session.destroyCalls, 1);
  assert.equal(req.session.userId, undefined);
  assert.equal(req.session.organizationId, undefined);
  assert.deepEqual(res.clearedCookies, ["invoice.sid"]);
  assert.equal(res.redirectedTo, "/auth/login");
  assert.deepEqual(auditEvents, [
    {
      type: "LOGOUT",
      userId: "user_1",
      organizationId: "org_1",
      ip: "203.0.113.10",
      userAgent: "Test Browser",
      sessionId: "sid_current",
    },
  ]);
});
