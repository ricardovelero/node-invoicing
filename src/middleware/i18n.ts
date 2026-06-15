import type { RequestHandler } from "express";
import {
  createTranslator,
  loadTranslations,
  localeFromPath,
  resolveLocale,
  toSupportedLocale,
  type SupportedLocale,
  type Translate,
  type TranslationCatalog,
} from "../lib/i18n";
import { env } from "../config/env";

const oneYearMs = 1000 * 60 * 60 * 24 * 365;

let cachedTranslations: TranslationCatalog | undefined;

const getTranslations = () =>
  env.NODE_ENV === "development"
    ? loadTranslations()
    : (cachedTranslations ??= loadTranslations());

declare global {
  namespace Express {
    interface Request {
      locale: SupportedLocale;
      t: Translate;
    }
  }
}

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

  const organizationLocale = toSupportedLocale(req.auth?.organization.locale);
  const cookieLocale = toSupportedLocale(req.cookies?.locale);
  const locale = resolveLocale({
    organizationLocale,
    cookieLocale,
    pathLocale,
    isAuthenticated: Boolean(req.auth),
  });
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
