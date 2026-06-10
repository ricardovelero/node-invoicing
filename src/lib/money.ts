const defaultCurrency = 'EUR';
const defaultLocale = 'en-GB';

export const formatMoney = (
  amountMinorUnits: number,
  currency = defaultCurrency,
  locale = defaultLocale,
) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amountMinorUnits / 100);

export const lineTotalCents = (quantity: number, unitPriceCents: number) =>
  Math.round(quantity * unitPriceCents);

export type DiscountType = 'amount' | 'percent';

export type DiscountInput = {
  type: DiscountType;
  value: number;
};

export type InvoiceLineCalculationInput = {
  quantity: number;
  unitPrice: number;
  discount: DiscountInput;
  taxRate: number;
};

export type InvoiceLineCalculation = {
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  discountCents: number;
  invoiceDiscountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
};

export type InvoiceCalculation = {
  subtotalCents: number;
  lineDiscountCents: number;
  discountCents: number;
  taxCents: number;
  withholdingAmountCents: number;
  totalCents: number;
  lines: InvoiceLineCalculation[];
};

export type WithholdingCalculationInput = {
  type: 'IRPF';
  rate: number;
} | null;

export const amountToCents = (amount: number) => Math.round(amount * 100);

export const percentToBasisPoints = (percent: number) =>
  Math.round(percent * 100);

export const calculateDiscountCents = (
  subtotalCents: number,
  discount: DiscountInput,
) => {
  if (subtotalCents <= 0 || discount.value <= 0) {
    return 0;
  }

  const discountCents =
    discount.type === 'amount' ?
      amountToCents(discount.value)
    : Math.round(
        (subtotalCents * percentToBasisPoints(discount.value)) / 10_000,
      );

  return Math.min(discountCents, subtotalCents);
};

const calculateTaxCents = (taxableCents: number, taxRate: number) =>
  Math.round((taxableCents * percentToBasisPoints(taxRate)) / 10_000);

export const calculateWithholdingCents = (
  taxableBaseCents: number,
  withholding: WithholdingCalculationInput,
) => {
  if (!withholding || taxableBaseCents <= 0 || withholding.rate <= 0) {
    return 0;
  }

  return Math.round(
    (taxableBaseCents * percentToBasisPoints(withholding.rate)) / 10_000,
  );
};

const allocateCents = (amountCents: number, weights: number[]) => {
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);

  if (amountCents <= 0 || totalWeight <= 0) {
    return weights.map(() => 0);
  }

  const shares = weights.map((weight, index) => {
    const rawShare = (amountCents * weight) / totalWeight;

    return {
      index,
      cents: Math.floor(rawShare),
      remainder: rawShare - Math.floor(rawShare),
    };
  });
  let remainingCents =
    amountCents - shares.reduce((total, share) => total + share.cents, 0);

  [...shares]
    .sort((left, right) => right.remainder - left.remainder)
    .forEach((share) => {
      if (remainingCents <= 0) {
        return;
      }

      share.cents += 1;
      remainingCents -= 1;
    });

  return shares
    .sort((left, right) => left.index - right.index)
    .map((share) => share.cents);
};

export const calculateInvoiceTotals = (
  lineInputs: InvoiceLineCalculationInput[],
  invoiceDiscount: DiscountInput,
  withholding: WithholdingCalculationInput = null,
): InvoiceCalculation => {
  const linesBeforeInvoiceDiscount = lineInputs.map((line) => {
    const unitPriceCents = amountToCents(line.unitPrice);
    const subtotalCents = lineTotalCents(line.quantity, unitPriceCents);
    const discountCents = calculateDiscountCents(subtotalCents, line.discount);

    return {
      quantity: line.quantity,
      unitPriceCents,
      subtotalCents,
      discountCents,
      taxableCents: subtotalCents - discountCents,
      taxRateBps: percentToBasisPoints(line.taxRate),
      taxRate: line.taxRate,
    };
  });

  const subtotalCents = linesBeforeInvoiceDiscount.reduce(
    (total, line) => total + line.subtotalCents,
    0,
  );
  const lineDiscountCents = linesBeforeInvoiceDiscount.reduce(
    (total, line) => total + line.discountCents,
    0,
  );
  const taxableSubtotalCents = linesBeforeInvoiceDiscount.reduce(
    (total, line) => total + line.taxableCents,
    0,
  );
  const discountCents = calculateDiscountCents(
    taxableSubtotalCents,
    invoiceDiscount,
  );
  const invoiceDiscountAllocations = allocateCents(
    discountCents,
    linesBeforeInvoiceDiscount.map((line) => line.taxableCents),
  );
  const lines = linesBeforeInvoiceDiscount.map((line, index) => {
    const invoiceDiscountCents = invoiceDiscountAllocations[index] ?? 0;
    const taxableCents = line.taxableCents - invoiceDiscountCents;
    const taxCents = calculateTaxCents(taxableCents, line.taxRate);

    return {
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      subtotalCents: line.subtotalCents,
      discountCents: line.discountCents,
      invoiceDiscountCents,
      taxRateBps: line.taxRateBps,
      taxCents,
      totalCents: line.taxableCents,
    };
  });
  const taxCents = lines.reduce((total, line) => total + line.taxCents, 0);
  const taxableBaseCents = taxableSubtotalCents - discountCents;
  const withholdingAmountCents = calculateWithholdingCents(
    taxableBaseCents,
    withholding,
  );

  return {
    subtotalCents,
    lineDiscountCents,
    discountCents,
    taxCents,
    withholdingAmountCents,
    totalCents: taxableBaseCents + taxCents - withholdingAmountCents,
    lines,
  };
};
