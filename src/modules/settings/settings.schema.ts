import { z } from "zod";

export const supportedCurrencies = ["EUR", "USD", "GBP", "CAD", "AUD"] as const;

const optionalText = (maxLength: number, message: string) =>
  z.string().trim().max(maxLength, message).optional().default("");

export const organizationSettingsSchema = z.object({
  legalName: optionalText(200, "Legal name must be 200 characters or fewer."),
  taxId: optionalText(80, "Tax ID must be 80 characters or fewer."),
  addressLine1: optionalText(200, "Address must be 200 characters or fewer."),
  city: optionalText(120, "City must be 120 characters or fewer."),
  country: optionalText(120, "Country must be 120 characters or fewer."),
  currency: z.enum(supportedCurrencies, { error: "Choose a supported currency." }),
  paymentInstructions: optionalText(
    2000,
    "Payment instructions must be 2,000 characters or fewer.",
  ),
});

export type OrganizationSettingsForm = z.infer<typeof organizationSettingsSchema>;

export type OrganizationSettingsValues = Record<keyof OrganizationSettingsForm, string>;

export type OrganizationSettingsErrors = Partial<
  Record<keyof OrganizationSettingsForm, string[]>
>;

type OrganizationSettingsSource = Partial<
  Record<keyof OrganizationSettingsForm, string | null | undefined>
>;

export const createOrganizationSettingsValues = (
  organization: OrganizationSettingsSource = {},
): OrganizationSettingsValues => ({
  legalName: organization.legalName ?? "",
  taxId: organization.taxId ?? "",
  addressLine1: organization.addressLine1 ?? "",
  city: organization.city ?? "",
  country: organization.country ?? "",
  currency: organization.currency ?? "EUR",
  paymentInstructions: organization.paymentInstructions ?? "",
});
