import { isValidSpanishNif } from './verifactu-nif';

// AEAT IDOtro identification types used for invoice recipients.
// 02: NIF-IVA (EU VAT number), 04: ID in the country of residence.
export type VerifactuIdOtro = {
  codigoPais: string;
  idType: '02' | '04';
  id: string;
};

export type VerifactuRecipientId = {
  nif: string | null;
  idOtro: VerifactuIdOtro | null;
};

const euCountryCodes = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]);

const normalizeCountryName = (value: string) =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z]/g, '');

const countryCodeAliases: Record<string, string> = {
  uk: 'GB',
  greatbritain: 'GB',
  usa: 'US',
  unitedstatesofamerica: 'US',
};

const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

// Customer countries are free text, so match English and Spanish region names.
const countryCodesByName = new Map<string, string>(
  ['en', 'es'].flatMap((locale) => {
    const displayNames = new Intl.DisplayNames([locale], { type: 'region' });

    return letters.flatMap((first) => letters.flatMap((second) => {
      const code = `${first}${second}`;
      const name = displayNames.of(code);
      // Skips deprecated aliases such as UK or FX, which ICU also names.
      const isCanonical = Intl.getCanonicalLocales(`und-${code}`)[0] === `und-${code}`;

      return name && name !== code && isCanonical
        ? [[normalizeCountryName(name), code] as const]
        : [];
    }));
  }),
);

export const resolveVerifactuCountryCode = (value: string | null | undefined) => {
  const name = normalizeCountryName(value ?? '');

  if (!name) {
    return null;
  }

  return countryCodeAliases[name] ??
    countryCodesByName.get(name) ??
    (/^[a-z]{2}$/u.test(name) ? name.toUpperCase() : null);
};

// Greece uses EL as its VAT prefix.
const vatPrefix = (countryCode: string) => countryCode === 'GR' ? 'EL' : countryCode;

// Spanish recipients, or recipients without a recognisable country, are sent as
// NIF. EU recipients are sent as NIF-IVA and the rest by their national tax ID.
export const buildVerifactuRecipientId = (
  taxId: string,
  country: string | null | undefined,
): VerifactuRecipientId => {
  const countryCode = resolveVerifactuCountryCode(country);
  const id = taxId.trim().toUpperCase();

  if (!countryCode || countryCode === 'ES') {
    const withoutPrefix = id.replace(/^ES/u, '');

    return { nif: isValidSpanishNif(withoutPrefix) ? withoutPrefix : id, idOtro: null };
  }

  if (euCountryCodes.has(countryCode)) {
    const vatNumber = id.replace(/[\s.-]/gu, '');
    const prefix = vatPrefix(countryCode);

    return {
      nif: null,
      idOtro: {
        codigoPais: countryCode,
        idType: '02',
        id: vatNumber.startsWith(prefix) ? vatNumber : `${prefix}${vatNumber}`,
      },
    };
  }

  return { nif: null, idOtro: { codigoPais: countryCode, idType: '04', id } };
};
