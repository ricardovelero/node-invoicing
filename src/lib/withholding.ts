export const withholdingTypes = ['IRPF'] as const;
export type WithholdingType = (typeof withholdingTypes)[number];

export const legalForms = ['sole_trader', 'company', 'other'] as const;
export type LegalForm = (typeof legalForms)[number];

export const standardIrpfRates = [15, 7] as const;

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
