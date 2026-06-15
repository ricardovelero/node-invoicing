import { z } from 'zod';
import { passwordRequirementsMessage } from '../auth/auth.schema';
import { supportedOrganizationCountryCodes } from '../../lib/countries';
import { supportedLocales } from '../../lib/i18n';
import {
  defaultSessionAbsoluteLifetimeDays,
  defaultSessionIdleTimeoutMinutes,
  maxSessionAbsoluteLifetimeDays,
  maxSessionIdleTimeoutMinutes,
  minSessionAbsoluteLifetimeDays,
  minSessionIdleTimeoutMinutes,
} from '../../lib/session-policy';
import {
  customRateType,
  legalForms,
  rateToNumber,
  resolveWithholdingRateType,
} from '../../lib/withholding';

export const supportedCurrencies = ['EUR', 'USD', 'GBP', 'CAD', 'AUD'] as const;

const optionalText = (maxLength: number, message: string) =>
  z.string().trim().max(maxLength, message).optional().default('');

const stringInput = (schema: z.ZodType<string>) =>
  z.preprocess((value) => (typeof value === 'string' ? value : ''), schema);

export const switchOrganizationSchema = z.object({
  organizationId: stringInput(
    z.string().trim().uuid('Choose an organization.'),
  ),
  returnTo: stringInput(z.string().trim()).optional().default(''),
});

export type SwitchOrganizationForm = z.infer<typeof switchOrganizationSchema>;

export const organizationSettingsSchema = z.object({
  legalName: stringInput(
    z.string().trim().min(1, 'Enter the legal name.').max(
      200,
      'Legal name must be 200 characters or fewer.',
    ),
  ),
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

type OrganizationSettingsSourceValue =
  | string
  | number
  | boolean
  | { toString: () => string }
  | null
  | undefined;

type OrganizationSettingsSource = Partial<
  Record<keyof OrganizationSettingsForm, OrganizationSettingsSourceValue> & {
    name: OrganizationSettingsSourceValue;
  }
>;

const sourceText = (
  value: OrganizationSettingsSourceValue,
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
    legalName: sourceText(organization.legalName, sourceText(organization.name)),
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

const integerInput = (messages: {
  required: string;
  invalid: string;
  min: string;
  max: string;
  minValue: number;
  maxValue: number;
}) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value ?? ''),
    z
      .string()
      .min(1, messages.required)
      .transform((value, ctx) => {
        const numericValue = Number(value);

        if (!Number.isInteger(numericValue)) {
          ctx.addIssue({
            code: 'custom',
            message: messages.invalid,
          });
          return z.NEVER;
        }

        return numericValue;
      })
      .refine((value) => value >= messages.minValue, messages.min)
      .refine((value) => value <= messages.maxValue, messages.max),
  );

export const securitySettingsSchema = z.object({
  sessionIdleTimeoutMinutes: integerInput({
    required: 'Enter an idle timeout.',
    invalid: 'Idle timeout must be a whole number of minutes.',
    min: `Idle timeout must be at least ${minSessionIdleTimeoutMinutes} minutes.`,
    max: `Idle timeout must be ${maxSessionIdleTimeoutMinutes} minutes or fewer.`,
    minValue: minSessionIdleTimeoutMinutes,
    maxValue: maxSessionIdleTimeoutMinutes,
  }),
  sessionAbsoluteLifetimeDays: integerInput({
    required: 'Enter an absolute session lifetime.',
    invalid: 'Absolute session lifetime must be a whole number of days.',
    min: `Absolute session lifetime must be at least ${minSessionAbsoluteLifetimeDays} day.`,
    max: `Absolute session lifetime must be ${maxSessionAbsoluteLifetimeDays} days or fewer.`,
    minValue: minSessionAbsoluteLifetimeDays,
    maxValue: maxSessionAbsoluteLifetimeDays,
  }),
});

export type SecuritySettingsForm = z.infer<typeof securitySettingsSchema>;

export type SecuritySettingsValues = Record<
  keyof SecuritySettingsForm,
  string
>;

export type SecuritySettingsErrors = Partial<
  Record<keyof SecuritySettingsForm, string[]>
>;

type SecuritySettingsSource = Partial<{
  sessionIdleTimeoutMinutes: string | number | { toString: () => string } | null | undefined;
  sessionAbsoluteLifetimeDays: string | number | { toString: () => string } | null | undefined;
}>;

export const createSecuritySettingsValues = (
  organization: SecuritySettingsSource = {},
): SecuritySettingsValues => ({
  sessionIdleTimeoutMinutes: sourceText(
    organization.sessionIdleTimeoutMinutes,
    defaultSessionIdleTimeoutMinutes.toString(),
  ),
  sessionAbsoluteLifetimeDays: sourceText(
    organization.sessionAbsoluteLifetimeDays,
    defaultSessionAbsoluteLifetimeDays.toString(),
  ),
});

const passwordInput = z.preprocess(
  (value) => (typeof value === 'string' ? value : ''),
  z
    .string()
    .min(1, 'Enter your password.')
    .superRefine((password, ctx) => {
      if (!password) {
        return;
      }

      const isStrong =
        password.length >= 8 &&
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /\d/.test(password);

      if (!isStrong) {
        ctx.addIssue({
          code: 'custom',
          message: passwordRequirementsMessage,
        });
      }
    }),
);

export const changePasswordSchema = z.object({
  currentPassword: stringInput(z.string().min(1, 'Enter your current password.')),
  newPassword: passwordInput,
  confirmPassword: stringInput(z.string().min(1, 'Confirm your new password.')),
}).superRefine((passwords, ctx) => {
  if (
    passwords.newPassword &&
    passwords.confirmPassword &&
    passwords.newPassword !== passwords.confirmPassword
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'New password and confirmation must match.',
    });
  }

  if (
    passwords.currentPassword &&
    passwords.newPassword &&
    passwords.currentPassword === passwords.newPassword
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['newPassword'],
      message: 'Choose a new password that is different from your current password.',
    });
  }
});

export type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export type ChangePasswordErrors = Partial<
  Record<keyof ChangePasswordForm, string[]>
>;
