import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { defaultLocale, type SupportedLocale } from "../lib/i18n";
import { localeMiddleware } from "./i18n";

type MockRequest = Request & {
  path: string;
  cookies?: Record<string, string>;
  auth?: Request["auth"];
  locale?: SupportedLocale;
};

type MockResponse = Response & {
  locals: Record<string, unknown>;
  cookies: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }>;
};

const createRequest = ({
  path = "/invoices",
  cookieLocale,
  organizationLocale,
}: {
  path?: string;
  cookieLocale?: string;
  organizationLocale?: string | null;
} = {}) =>
  ({
    path,
    cookies: cookieLocale ? { locale: cookieLocale } : {},
    auth:
      organizationLocale === undefined
        ? undefined
        : {
            user: { id: "user_1", email: "ada@example.com", name: "Ada" },
            organization: {
              id: "org_1",
              name: "Example",
              legalName: null,
              billingEmail: null,
              taxId: null,
              addressLine1: null,
              city: null,
              country: null,
              currency: "EUR",
              locale: organizationLocale,
              paymentInstructions: null,
            },
            role: "OWNER",
          },
  }) as MockRequest;

const createResponse = () => {
  const res = {
    locals: {},
    cookies: [] as MockResponse["cookies"],
    cookie(name: string, value: string, options: Record<string, unknown>) {
      res.cookies.push({ name, value, options });
      return res;
    },
  };

  return res as unknown as MockResponse;
};

const createNext = () => {
  let called = false;
  const next: NextFunction = () => {
    called = true;
  };

  return {
    next,
    get called() {
      return called;
    },
  };
};

test("localeMiddleware prefers authenticated organization locale", () => {
  const req = createRequest({
    cookieLocale: "es-ES",
    organizationLocale: "en-US",
  });
  const res = createResponse();
  const next = createNext();

  localeMiddleware(req, res, next.next);

  assert.equal(req.locale, "en-US");
  assert.equal(res.locals.currentLocale, "en-US");
  assert.equal(req.t("common.navigation.settings"), "Settings");
  assert.equal(next.called, true);
});

test("localeMiddleware falls back to a valid locale cookie", () => {
  const req = createRequest({
    cookieLocale: "es-ES",
    organizationLocale: null,
  });
  const res = createResponse();
  const next = createNext();

  localeMiddleware(req, res, next.next);

  assert.equal(req.locale, "es-ES");
  assert.equal(res.locals.currentLanguage, "es-es");
});

test("localeMiddleware falls back to the default locale", () => {
  const req = createRequest({
    cookieLocale: "fr-FR",
    organizationLocale: null,
  });
  const res = createResponse();
  const next = createNext();

  localeMiddleware(req, res, next.next);

  assert.equal(req.locale, defaultLocale);
});

test("localeMiddleware detects and persists locale path prefixes", () => {
  const req = createRequest({ path: "/es/pricing" });
  const res = createResponse();
  const next = createNext();

  localeMiddleware(req, res, next.next);

  assert.equal(req.locale, "es-ES");
  assert.deepEqual(res.cookies, [
    {
      name: "locale",
      value: "es-ES",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 31536000000,
      },
    },
  ]);
});
