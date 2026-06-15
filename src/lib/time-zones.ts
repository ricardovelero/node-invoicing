export const defaultTimeZone = '';

export const supportedTimeZones = [
  'UTC',
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

export type SupportedTimeZone = (typeof supportedTimeZones)[number];

export const isSupportedTimeZone = (
  timeZone: unknown,
): timeZone is SupportedTimeZone =>
  typeof timeZone === 'string' &&
  supportedTimeZones.includes(timeZone as SupportedTimeZone);

export const createTimeZoneOptions = (
  defaultLabel: string,
): Array<{ value: string; label: string }> => [
  { value: defaultTimeZone, label: defaultLabel },
  ...supportedTimeZones.map((timeZone) => ({
    value: timeZone,
    label: timeZone,
  })),
];
