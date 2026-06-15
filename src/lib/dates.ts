import { defaultLocale } from "./locales";

export const formatDate = (date: Date | string, locale: string = defaultLocale) =>
  new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(date));
