import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { handleRegister, loginUser, logoutUser } from "./auth.controller";
import * as authService from "./auth.service";

type MockSession = {
  userId?: string;
  organizationId?: string;
  regenerateCalls: number;
  destroyCalls: number;
  regenerate: (callback: (error?: Error) => void) => void;
  destroy: (callback: (error?: Error) => void) => void;
};

type MockRequest = Request & {
  body: Record<string, unknown>;
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
};

const originalRegisterUser = authServiceMock.registerUser;
const originalAuthenticateUser = authServiceMock.authenticateUser;

afterEach(() => {
  authServiceMock.registerUser = originalRegisterUser;
  authServiceMock.authenticateUser = originalAuthenticateUser;
});

const createRequest = (body: Record<string, unknown> = {}) => {
  const session: MockSession = {
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
    session,
    flashMessages: {},
    flash(type: string, message: string) {
      this.flashMessages[type] ??= [];
      this.flashMessages[type].push(message);
      return this.flashMessages[type];
    },
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
    return { ok: true, userId: "user_1", organizationId: "org_1" };
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
  assert.deepEqual(req.flashMessages.success, ["Account created successfully."]);
  assert.equal(res.redirectedTo, "/");
});

test("handleRegister rejects weak passwords and missing organization before creating records", async () => {
  let serviceCalls = 0;

  authServiceMock.registerUser = async () => {
    serviceCalls += 1;
    return { ok: true, userId: "user_1", organizationId: "org_1" };
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

test("loginUser stores the authenticated service result in session", async () => {
  let serviceData: unknown;

  authServiceMock.authenticateUser = async (data) => {
    serviceData = data;
    return { ok: true, userId: "user_1", organizationId: "org_1" };
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
  assert.equal(res.redirectedTo, "/");
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
});
