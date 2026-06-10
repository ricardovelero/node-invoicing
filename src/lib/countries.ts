export const supportedOrganizationCountryCodes = ['ES', 'GB', 'US'] as const;

export type SupportedOrganizationCountryCode =
  (typeof supportedOrganizationCountryCodes)[number];

export const supportedOrganizationCountries: Array<{
  code: SupportedOrganizationCountryCode;
  label: string;
}> = [
  { code: 'ES', label: 'Spain' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States of America' },
] as const;

const organizationCountryLabels = new Map<string, string>(
  supportedOrganizationCountries.map((country) => [country.code, country.label]),
);

export const getOrganizationCountryLabel = (
  countryCode: string | null | undefined,
) => {
  if (!countryCode) {
    return null;
  }

  return organizationCountryLabels.get(countryCode.toUpperCase()) ?? null;
};
