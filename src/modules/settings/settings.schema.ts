import { z } from 'zod';
import { supportedOrganizationCountryCodes } from '../../lib/countries';
import { supportedLocales } from '../../lib/i18n';
import {
  customRateType,
  legalForms,
  rateToNumber,
  resolveWithholdingRateType,
} from '../../lib/withholding';

export const supportedCurrencies = ['EUR', 'USD', 'GBP', 'CAD', 'AUD'] as const;

const optionalText = (maxLength: number, message: string) =>
  z.string().trim().max(maxLength, message).optional().default('');

export const organizationSettingsSchema = z.object({
  legalName: optionalText(200, 'Legal name must be 200 characters or fewer.'),
  billingEmail: optionalText(
    254,
    'Billing email must be 254 characters or fewer.',
  ).pipe(z.string().email('Enter a valid billing email.').or(z.literal(''))),
  taxId: optionalText(80, 'Tax ID must be 80 characters or fewer.'),
  addressLine1: optionalText(200, 'Address must be 200 characters or fewer.'),
  city: optionalText(120, 'City must be 120 characters or fewer.'),
  countryCode: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : ''),
    z.enum(supportedOrganizationCountryCodes, {
      error: 'Choose a supported country.',
    }),
  ),
  legalForm: z.enum(legalForms, {
    error: 'Choose a supported legal form.',
  }).default('other'),
  currency: z.enum(supportedCurrencies, {
    error: 'Choose a supported currency.',
  }),
  withholdingEnabled: z.preprocess(
    (value) => value === 'on' || value === 'true' || value === true,
    z.boolean(),
  ).default(false),
  defaultWithholdingType: z.enum(['IRPF']).or(z.literal('')).default(''),
  // Country-driven rate-type token: the custom sentinel or any positive numeric
  // label. The superRefine below enforces consistency with the stored rate.
  defaultWithholdingRateType: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().refine(
      (value) =>
        value === customRateType ||
        (Number.isFinite(Number(value)) && Number(value) > 0),
      'Choose a supported withholding rate.',
    ),
  ).default(customRateType),
  defaultWithholdingRate: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value ?? ''),
    z.string()
      .transform((value, ctx) => {
        if (value === '') {
          return null;
        }

        const rate = Number(value);

        if (!Number.isFinite(rate)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Enter a valid withholding rate.',
          });
          return z.NEVER;
        }

        return rate;
      })
      .refine((rate) => rate === null || rate > 0, {
        message: 'Withholding rate must be greater than zero.',
      }),
  ).default(null),
  paymentInstructions: optionalText(
    2000,
    'Payment instructions must be 2,000 characters or fewer.',
  ),
}).superRefine((settings, ctx) => {
  if (!settings.withholdingEnabled) {
    return;
  }

  if (settings.defaultWithholdingType !== 'IRPF') {
    ctx.addIssue({
      code: 'custom',
      path: ['defaultWithholdingType'],
      message: 'Choose a supported withholding type.',
    });
  }

  if (settings.defaultWithholdingRate === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['defaultWithholdingRate'],
      message: 'Enter a withholding rate.',
    });
  }

  if (
    settings.defaultWithholdingRateType !== customRateType &&
    settings.defaultWithholdingRate !== Number(settings.defaultWithholdingRateType)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['defaultWithholdingRate'],
      message: 'Choose the selected withholding rate or use custom.',
    });
  }
});

export type OrganizationSettingsForm = z.infer<
  typeof organizationSettingsSchema
>;

export type OrganizationSettingsValues = Record<
  keyof OrganizationSettingsForm,
  string
>;

export type OrganizationSettingsErrors = Partial<
  Record<keyof OrganizationSettingsForm, string[]>
>;

type OrganizationSettingsSource = Partial<{
  [Key in keyof OrganizationSettingsForm]:
    | string
    | number
    | boolean
    | { toString: () => string }
    | null
    | undefined;
}>;

const sourceText = (
  value: string | number | boolean | { toString: () => string } | null | undefined,
  fallback = '',
) => (value === null || value === undefined ? fallback : value.toString());

const resolveDefaultWithholdingRateType = (
  organization: OrganizationSettingsSource,
) => {
  // Form submissions carry an explicit rate type; the organization row does
  // not, so fall back to deriving it from the stored rate for the country.
  const explicit = sourceText(organization.defaultWithholdingRateType);

  if (
    explicit === customRateType ||
    (explicit !== '' && Number.isFinite(Number(explicit)) && Number(explicit) > 0)
  ) {
    return explicit;
  }

  return (
    resolveWithholdingRateType(
      organization.defaultWithholdingRate,
      sourceText(organization.countryCode) || null,
    ) || '15'
  );
};

export const createOrganizationSettingsValues = (
  organization: OrganizationSettingsSource = {},
): OrganizationSettingsValues => {
  const defaultWithholdingRateType =
    resolveDefaultWithholdingRateType(organization);

  return {
    legalName: sourceText(organization.legalName),
    billingEmail: sourceText(organization.billingEmail),
    taxId: sourceText(organization.taxId),
    addressLine1: sourceText(organization.addressLine1),
    city: sourceText(organization.city),
    countryCode: sourceText(organization.countryCode),
    legalForm: sourceText(organization.legalForm, 'other'),
    currency: sourceText(organization.currency, 'EUR'),
    withholdingEnabled: organization.withholdingEnabled ? 'on' : '',
    defaultWithholdingType: sourceText(organization.defaultWithholdingType),
    defaultWithholdingRateType,
    defaultWithholdingRate:
      defaultWithholdingRateType === customRateType
        ? sourceText(organization.defaultWithholdingRate)
        : rateToNumber(organization.defaultWithholdingRate)?.toString() ?? '15',
    paymentInstructions: sourceText(organization.paymentInstructions),
  };
};

export const localizationSettingsSchema = z.object({
  locale: z.enum(supportedLocales, { error: 'Choose a supported locale.' }),
});

export type LocalizationSettingsForm = z.infer<
  typeof localizationSettingsSchema
>;

export type LocalizationSettingsValues = Record<
  keyof LocalizationSettingsForm,
  string
>;

export type LocalizationSettingsErrors = Partial<
  Record<keyof LocalizationSettingsForm, string[]>
>;

type LocalizationSettingsSource = Partial<{
  locale: string | { toString: () => string } | null | undefined;
}>;

export const createLocalizationSettingsValues = (
  organization: LocalizationSettingsSource = {},
): LocalizationSettingsValues => ({
  locale: sourceText(organization.locale, 'en-GB'),
});
