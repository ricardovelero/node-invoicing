import type { OrganizationFiscalRegime } from '@prisma/client';

export type VerifactuRegimeOrganization = {
  countryCode: string | null;
  fiscalRegime: OrganizationFiscalRegime;
};

// Spanish organizations under Veri*Factu send their invoicing records to AEAT.
// SII organizations and non-Spanish ones invoice without it.
export const usesVerifactu = (organization: VerifactuRegimeOrganization | null | undefined) =>
  organization?.countryCode === 'ES' && organization.fiscalRegime === 'VERIFACTU';

// Basque Country and Navarra organizations need TicketBAI or Navarra's own
// system, which isn't supported, so they can't issue invoices.
export const hasUnsupportedFiscalRegime = (
  organization: VerifactuRegimeOrganization | null | undefined,
) => organization?.countryCode === 'ES' && organization.fiscalRegime === 'FORAL';
