import { prisma } from "../../db/prisma";
import type { OrganizationSettingsForm } from "./settings.schema";

const emptyToNull = (value: string) => value || null;

export const updateOrganizationSettings = (
  organizationId: string,
  data: OrganizationSettingsForm,
) =>
  prisma.organization.update({
    where: { id: organizationId },
    data: {
      legalName: emptyToNull(data.legalName),
      taxId: emptyToNull(data.taxId),
      addressLine1: emptyToNull(data.addressLine1),
      city: emptyToNull(data.city),
      country: emptyToNull(data.country),
      currency: data.currency,
      paymentInstructions: emptyToNull(data.paymentInstructions),
    },
  });
