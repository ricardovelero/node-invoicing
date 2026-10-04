import { readFileSync } from 'node:fs';
import path from 'node:path';
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

let aeatCountryCodes: Set<string> | undefined;

// CodigoPais must be one of the codes in the XSD's CountryType2 enumeration.
const getAeatCountryCodes = () => {
  if (aeatCountryCodes) {
    return aeatCountryCodes;
  }

  const xsd = readFileSync(
    path.join(process.cwd(), 'vendor', 'aeat', 'verifactu', 'xsd', 'SuministroInformacion.xsd'),
    'utf8',
  );
  const countryType = xsd.match(/<simpleType name="CountryType2">[\s\S]*?<\/simpleType>/u)?.[0];

  aeatCountryCodes = new Set(
    [...(countryType ?? '').matchAll(/value="([A-Z]{2})"/gu)].map(([, code]) => code),
  );

  return aeatCountryCodes;
};

export const resolveVerifactuCountryCode = (value: string | null | undefined) => {
  const name = normalizeCountryName(value ?? '');

  if (!name) {
    return null;
  }

  const code = countryCodeAliases[name] ??
    countryCodesByName.get(name) ??
    (/^[a-z]{2}$/u.test(name) ? name.toUpperCase() : null);

  return code && getAeatCountryCodes().has(code) ? code : null;
};

// Greece uses EL as its VAT prefix.
const vatPrefix = (countryCode: string) => countryCode === 'GR' ? 'EL' : countryCode;

// Recipients with a Spanish NIF, wherever they reside, and recipients without a
// recognisable country are sent as NIF. EU VAT numbers are sent as NIF-IVA and
// any other ID as the national tax ID of the country of residence.
export const buildVerifactuRecipientId = (
  taxId: string,
  country: string | null | undefined,
): VerifactuRecipientId => {
  const countryCode = resolveVerifactuCountryCode(country);
  const id = taxId.trim().toUpperCase();
  const withoutPrefix = id.replace(/^ES/u, '');

  if (isValidSpanishNif(withoutPrefix)) {
    return { nif: withoutPrefix, idOtro: null };
  }

  if (!countryCode || countryCode === 'ES') {
    return { nif: id, idOtro: null };
  }

  const vatNumber = id.replace(/[\s.-]/gu, '');

  // Only IDs that already carry the VAT prefix are known to be VAT numbers.
  if (euCountryCodes.has(countryCode) && vatNumber.startsWith(vatPrefix(countryCode))) {
    return { nif: null, idOtro: { codigoPais: countryCode, idType: '02', id: vatNumber } };
  }

  return { nif: null, idOtro: { codigoPais: countryCode, idType: '04', id } };
};
