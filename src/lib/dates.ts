export const formatDate = (date: Date | string, locale = "en-GB") =>
  new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(date));
