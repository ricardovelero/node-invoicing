export const withholdingTypes = ['IRPF'] as const;
export type WithholdingType = (typeof withholdingTypes)[number];

export const legalForms = ['sole_trader', 'company', 'other'] as const;
export type LegalForm = (typeof legalForms)[number];

// Country-keyed source of truth for the fixed withholding rates each country
// exposes in the settings/invoice dropdowns. Add a country here to surface its
// standard rates; eligibility and the type label are still gated separately.
export const withholdingConfigByCountry = {
  ES: { type: 'IRPF', standardRates: [15, 7] },
} as const satisfies Record<
  string,
  { type: WithholdingType; standardRates: readonly number[] }
>;

export const customRateType = 'custom' as const;

type RateLike = number | string | { toString: () => string } | null | undefined;

export type OrganizationWithholdingSettings = {
  countryCode?: string | null;
  legalForm?: string | null;
  withholdingEnabled?: boolean | null;
  defaultWithholdingType?: string | null;
  defaultWithholdingRate?: RateLike;
};

export type InvoiceWithholdingInput = {
  applyWithholding?: boolean;
  withholdingType?: string;
  withholdingRate?: number | null;
};

export const rateToNumber = (rate: RateLike) => {
  if (rate === null || rate === undefined || rate === '') {
    return null;
  }

  const value = typeof rate === 'number' ? rate : Number(rate.toString());

  return Number.isFinite(value) ? value : null;
};

export const isSpanishIrpfEligible = (
  organization: OrganizationWithholdingSettings,
) =>
  organization.countryCode === 'ES' &&
  (organization.legalForm ?? 'other') !== 'company';

export const canUseInvoiceWithholding = (
  organization: OrganizationWithholdingSettings,
) =>
  isSpanishIrpfEligible(organization) &&
  organization.withholdingEnabled === true &&
  organization.defaultWithholdingType === 'IRPF';

export const normalizeOrganizationWithholdingSettings = <
  Settings extends OrganizationWithholdingSettings,
>(
  settings: Settings,
) => {
  const countryCode = settings.countryCode?.trim().toUpperCase() || null;
  const legalForm: LegalForm = legalForms.includes(settings.legalForm as LegalForm)
    ? (settings.legalForm as LegalForm)
    : 'other';
  const baseSettings = {
    countryCode,
    legalForm,
  };

  if (!isSpanishIrpfEligible(baseSettings)) {
    return {
      ...baseSettings,
      withholdingEnabled: false,
      defaultWithholdingType: null,
      defaultWithholdingRate: null,
    };
  }

  const rate = rateToNumber(settings.defaultWithholdingRate);
  const withholdingEnabled = settings.withholdingEnabled === true;

  return {
    ...baseSettings,
    withholdingEnabled,
    defaultWithholdingType: withholdingEnabled ? 'IRPF' : null,
    defaultWithholdingRate: withholdingEnabled ? rate : null,
  };
};

export const resolveInvoiceWithholding = (
  organization: OrganizationWithholdingSettings,
  input: InvoiceWithholdingInput,
) => {
  if (!canUseInvoiceWithholding(organization) || !input.applyWithholding) {
    return {
      withholdingType: null,
      withholdingRate: null,
      withholdingAmountCents: null,
    };
  }

  return {
    withholdingType: 'IRPF' as const,
    withholdingRate: input.withholdingRate ?? null,
    withholdingAmountCents: null,
  };
};

export const formatRateLabel = (rate: RateLike) => {
  const numericRate = rateToNumber(rate);

  if (numericRate === null) {
    return '';
  }

  return numericRate.toFixed(2).replace(/\.?0+$/, '');
};

export const getStandardWithholdingRates = (
  countryCode?: string | null,
): readonly number[] => {
  const key = countryCode?.trim().toUpperCase() ?? '';

  return (
    withholdingConfigByCountry[key as keyof typeof withholdingConfigByCountry]
      ?.standardRates ?? []
  );
};

// Maps a stored/typed rate to the rate-type select value: the rate's label when
// it is a standard rate for the country, otherwise the custom sentinel ('' when
// there is no rate at all).
export const resolveWithholdingRateType = (
  rate: RateLike,
  countryCode?: string | null,
): string => {
  const numeric = rateToNumber(rate);

  if (numeric === null) {
    return '';
  }

  return getStandardWithholdingRates(countryCode).includes(numeric)
    ? formatRateLabel(numeric)
    : customRateType;
};

export const getWithholdingRateOptions = (countryCode?: string | null) =>
  getStandardWithholdingRates(countryCode).map((rate) => ({
    value: formatRateLabel(rate),
    label: `${formatRateLabel(rate)}%`,
  }));
