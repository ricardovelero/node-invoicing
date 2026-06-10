import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { csrfErrorMessage, csrfProtection } from "./csrf";

type MockRequest = Request & {
  body?: Record<string, unknown>;
  method: string;
  session: {
    csrfToken?: string;
  };
};

type MockResponse = Response & {
  locals: Record<string, unknown>;
};

const createRequest = (
  method: string,
  body: Record<string, unknown> = {},
  csrfToken?: string,
) =>
  ({
    method,
    body,
    session: {
      csrfToken,
    },
  }) as MockRequest;

const createResponse = () =>
  ({
    locals: {},
  }) as MockResponse;

const createNext = () => {
  const calls: unknown[] = [];
  const next: NextFunction = (error?: unknown) => {
    calls.push(error);
  };

  return {
    next,
    get calls() {
      return calls;
    },
    get error() {
      return calls[0];
    },
  };
};

test("csrfProtection creates and exposes a session token for GET requests", () => {
  const req = createRequest("GET");
  const res = createResponse();
  const next = createNext();

  csrfProtection(req, res, next.next);

  assert.equal(next.calls.length, 1);
  assert.equal(next.error, undefined);
  assert.equal(typeof req.session.csrfToken, "string");
  assert.equal(req.session.csrfToken?.length, 64);
  assert.equal(res.locals.csrfToken, req.session.csrfToken);
});

test("csrfProtection allows POST requests with a matching token", () => {
  const token = "a".repeat(64);
  const req = createRequest("POST", { _csrf: token }, token);
  const res = createResponse();
  const next = createNext();

  csrfProtection(req, res, next.next);

  assert.equal(next.calls.length, 1);
  assert.equal(next.error, undefined);
  assert.equal(res.locals.csrfToken, token);
});

test("csrfProtection rejects POST requests without a token", () => {
  const req = createRequest("POST", {}, "a".repeat(64));
  const res = createResponse();
  const next = createNext();

  csrfProtection(req, res, next.next);

  const error = next.error as Error & { status?: number };

  assert.equal(next.calls.length, 1);
  assert.equal(error.message, csrfErrorMessage);
  assert.equal(error.status, 403);
});

test("csrfProtection rejects POST requests with the wrong token", () => {
  const req = createRequest("POST", { _csrf: "b".repeat(64) }, "a".repeat(64));
  const res = createResponse();
  const next = createNext();

  csrfProtection(req, res, next.next);

  const error = next.error as Error & { status?: number };

  assert.equal(error.message, csrfErrorMessage);
  assert.equal(error.status, 403);
});

test("csrfProtection rejects different token lengths without throwing", () => {
  const req = createRequest("POST", { _csrf: "short" }, "a".repeat(64));
  const res = createResponse();
  const next = createNext();

  assert.doesNotThrow(() => csrfProtection(req, res, next.next));

  const error = next.error as Error & { status?: number };

  assert.equal(error.message, csrfErrorMessage);
  assert.equal(error.status, 403);
});

test("all server-rendered POST forms include a CSRF field", () => {
  const viewsPath = path.join(process.cwd(), "src", "views");
  const templates = [
    "layouts/app.njk",
    "pages/auth/login.njk",
    "pages/auth/register.njk",
    "pages/customers/detail.njk",
    "pages/customers/form.njk",
    "pages/invoices/detail.njk",
    "pages/invoices/form.njk",
    "pages/settings/organization.njk",
    "pages/settings/localization.njk",
  ];

  templates.forEach((template) => {
    const contents = readFileSync(path.join(viewsPath, template), "utf8");
    const postForms = contents.match(/<form\b[^>]*method="post"[^>]*>[\s\S]*?<\/form>/g) ?? [];

    postForms.forEach((form) => {
      assert.match(form, /name="_csrf"/, `${template} has a POST form without _csrf`);
    });
  });
});
