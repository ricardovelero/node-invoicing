import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const supportedLocales = ["en-US", "en-GB", "es-ES"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = "en-GB";

export const localePathPrefixes: Record<string, SupportedLocale> = {
  "/en": "en-GB",
  "/en-us": "en-US",
  "/es": "es-ES",
};

type TranslationValue = string | { [key: string]: TranslationValue };
type TranslationNamespace = Record<string, TranslationValue>;
export type TranslationCatalog = Record<
  SupportedLocale,
  Record<string, TranslationNamespace>
>;
export type TranslationParams = Record<
  string,
  string | number | boolean | null | undefined
>;
export type Translate = (key: string, params?: TranslationParams) => string;

export const isSupportedLocale = (locale: unknown): locale is SupportedLocale =>
  typeof locale === "string" &&
  supportedLocales.includes(locale as SupportedLocale);

export const toSupportedLocale = (
  value: unknown,
): SupportedLocale | undefined => (isSupportedLocale(value) ? value : undefined);

type LocaleResolution = {
  organizationLocale?: SupportedLocale;
  cookieLocale?: SupportedLocale;
  pathLocale?: SupportedLocale;
  isAuthenticated: boolean;
};

export const resolveLocale = ({
  organizationLocale,
  cookieLocale,
  pathLocale,
  isAuthenticated,
}: LocaleResolution): SupportedLocale => {
  if (organizationLocale) {
    return organizationLocale;
  }

  return isAuthenticated
    ? cookieLocale ?? pathLocale ?? defaultLocale
    : pathLocale ?? cookieLocale ?? defaultLocale;
};

const emptyCatalog = (): TranslationCatalog =>
  Object.fromEntries(supportedLocales.map((locale) => [locale, {}])) as TranslationCatalog;

const readJsonFile = (filePath: string): TranslationNamespace => {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as TranslationNamespace;
};

const loadNamespaceFile = (
  catalog: TranslationCatalog,
  locale: SupportedLocale,
  namespace: string,
  filePath: string,
) => {
  if (existsSync(filePath)) {
    catalog[locale][namespace] = readJsonFile(filePath);
  }
};

export const loadTranslations = (
  rootPath = process.cwd(),
): TranslationCatalog => {
  const catalog = emptyCatalog();
  const globalLocalesPath = path.join(rootPath, "src", "locales");
  const modulesPath = path.join(rootPath, "src", "modules");

  for (const locale of supportedLocales) {
    loadNamespaceFile(
      catalog,
      locale,
      "common",
      path.join(globalLocalesPath, locale, "common.json"),
    );
  }

  if (!existsSync(modulesPath)) {
    return catalog;
  }

  for (const moduleEntry of readdirSync(modulesPath, { withFileTypes: true })) {
    if (!moduleEntry.isDirectory()) {
      continue;
    }

    for (const locale of supportedLocales) {
      loadNamespaceFile(
        catalog,
        locale,
        moduleEntry.name,
        path.join(modulesPath, moduleEntry.name, "locales", `${locale}.json`),
      );
    }
  }

  return catalog;
};

const findTranslation = (
  catalog: TranslationCatalog,
  locale: SupportedLocale,
  key: string,
) => {
  const parts = key.split(".");
  let current: TranslationValue | undefined = catalog[locale];

  for (const part of parts) {
    if (!current || typeof current === "string") {
      return undefined;
    }

    current = current[part];
  }

  return typeof current === "string" ? current : undefined;
};

const interpolate = (message: string, params: TranslationParams = {}) =>
  message.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });

type TranslatorOptions = {
  environment?: "development" | "test" | "production";
};

export const createTranslator = (
  locale: SupportedLocale,
  catalog: TranslationCatalog,
  options: TranslatorOptions = {},
): Translate => {
  const environment = options.environment ?? process.env.NODE_ENV ?? "development";

  return (key, params) => {
    const translated = findTranslation(catalog, locale, key);

    if (translated) {
      return interpolate(translated, params);
    }

    if (environment === "development") {
      return `[missing:${locale}.${key}]`;
    }

    const fallback = findTranslation(catalog, defaultLocale, key);
    return fallback ? interpolate(fallback, params) : key;
  };
};

export const localeFromPath = (requestPath: string) => {
  const firstSegment = `/${requestPath.split("/").filter(Boolean)[0] ?? ""}`.toLowerCase();
  return localePathPrefixes[firstSegment];
};
