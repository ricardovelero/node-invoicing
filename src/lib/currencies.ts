export const defaultCurrency = 'EUR';

export const supportedCurrencies = ['EUR', 'USD', 'GBP', 'CAD', 'AUD'] as const;

export type SupportedCurrency = (typeof supportedCurrencies)[number];

export const createCurrencyOptions = () =>
  supportedCurrencies.map((currency) => ({
    value: currency,
    label: currency,
  }));
