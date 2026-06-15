export const supportedLocales = ["en-US", "en-GB", "es-ES"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = "en-GB";

export const localePathPrefixes: Record<string, SupportedLocale> = {
  "/en": "en-GB",
  "/en-us": "en-US",
  "/es": "es-ES",
};

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

export const localeFromPath = (requestPath: string) => {
  const firstSegment = `/${requestPath.split("/").filter(Boolean)[0] ?? ""}`.toLowerCase();
  return localePathPrefixes[firstSegment];
};
