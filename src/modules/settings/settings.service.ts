import { prisma } from "../../db/prisma";
import { normalizeOrganizationWithholdingSettings } from "../../lib/withholding";
import type { OrganizationSettingsForm } from "./settings.schema";

const emptyToNull = (value: string) => value || null;

export const updateOrganizationSettings = (
  organizationId: string,
  data: OrganizationSettingsForm,
) => {
  const withholdingSettings = normalizeOrganizationWithholdingSettings({
    countryCode: data.countryCode,
    legalForm: data.legalForm,
    withholdingEnabled: data.withholdingEnabled,
    defaultWithholdingType: data.defaultWithholdingType || null,
    defaultWithholdingRate: data.defaultWithholdingRate,
  });

  return prisma.organization.update({
    where: { id: organizationId },
    data: {
      legalName: emptyToNull(data.legalName),
      billingEmail: emptyToNull(data.billingEmail),
      taxId: emptyToNull(data.taxId),
      addressLine1: emptyToNull(data.addressLine1),
      city: emptyToNull(data.city),
      countryCode: withholdingSettings.countryCode,
      legalForm: withholdingSettings.legalForm,
      currency: data.currency,
      locale: data.locale,
      withholdingEnabled: withholdingSettings.withholdingEnabled,
      defaultWithholdingType: withholdingSettings.defaultWithholdingType,
      defaultWithholdingRate: withholdingSettings.defaultWithholdingRate,
      paymentInstructions: emptyToNull(data.paymentInstructions),
    },
  });
};
