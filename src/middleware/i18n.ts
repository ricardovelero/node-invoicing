import type { RequestHandler } from "express";
import {
  createTranslator,
  defaultLocale,
  isSupportedLocale,
  loadTranslations,
  localeFromPath,
  type SupportedLocale,
  type Translate,
} from "../lib/i18n";
import { env } from "../config/env";

const oneYearMs = 1000 * 60 * 60 * 24 * 365;
const translations = loadTranslations();

const getTranslations = () =>
  env.NODE_ENV === "development" ? loadTranslations() : translations;

declare global {
  namespace Express {
    interface Request {
      locale: SupportedLocale;
      t: Translate;
    }
  }
}

const validCookieLocale = (locale: unknown) =>
  isSupportedLocale(locale) ? locale : undefined;

const validOrganizationLocale = (locale: unknown) =>
  isSupportedLocale(locale) ? locale : undefined;

export const localeMiddleware: RequestHandler = (req, res, next) => {
  const pathLocale = localeFromPath(req.path);

  if (pathLocale) {
    res.cookie("locale", pathLocale, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: oneYearMs,
    });
  }

  const organizationLocale = validOrganizationLocale(req.auth?.organization.locale);
  const cookieLocale = validCookieLocale(req.cookies?.locale);
  const locale =
    organizationLocale ??
    (req.auth ? cookieLocale : pathLocale ?? cookieLocale) ??
    pathLocale ??
    defaultLocale;
  const t = createTranslator(locale, getTranslations(), {
    environment: env.NODE_ENV,
  });

  req.locale = locale;
  req.t = t;
  res.locals.currentLocale = locale;
  res.locals.currentLanguage = locale.toLowerCase();
  res.locals.t = t;

  next();
};
