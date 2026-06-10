import { calculateInvoiceTotals, type DiscountType } from '../../../lib/money';
import { updateRemoveButtons } from './lines';

export const parseNumberInput = (input: HTMLInputElement) => {
  const value = Number(input.value);

  return Number.isFinite(value) ? value : 0;
};

export const parseDiscountType = (select: HTMLSelectElement): DiscountType =>
  select.value === 'percent' ? 'percent' : 'amount';

export const updateCurrency = ({
  currencySelect,
  form,
  locale,
}: {
  currencySelect: HTMLSelectElement;
  form: HTMLFormElement;
  locale: string;
}) => {
  const currency = currencySelect.value || 'EUR';
  form.dataset.currency = currency;
  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  });

  form
    .querySelectorAll<HTMLOptionElement>('[data-invoice-currency-option]')
    .forEach((option) => {
      option.textContent = currency;
    });

  return currencyFormatter;
};

export const readLineInput = (row: HTMLElement) => {
  const quantityInput = row.querySelector<HTMLInputElement>(
    '[data-invoice-quantity]',
  );
  const unitPriceInput = row.querySelector<HTMLInputElement>(
    '[data-invoice-unit-price]',
  );
  const discountType = row.querySelector<HTMLSelectElement>(
    '[data-invoice-line-discount-type]',
  );
  const discountValue = row.querySelector<HTMLInputElement>(
    '[data-invoice-line-discount-value]',
  );
  const taxRate = row.querySelector<HTMLInputElement>(
    '[data-invoice-tax-rate]',
  );

  if (
    !quantityInput ||
    !unitPriceInput ||
    !discountType ||
    !discountValue ||
    !taxRate
  ) {
    return {
      quantity: 0,
      unitPrice: 0,
      discount: { type: 'amount' as const, value: 0 },
      taxRate: 0,
    };
  }

  return {
    quantity: parseNumberInput(quantityInput),
    unitPrice: parseNumberInput(unitPriceInput),
    discount: {
      type: parseDiscountType(discountType),
      value: parseNumberInput(discountValue),
    },
    taxRate: parseNumberInput(taxRate),
  };
};

type UpdateTotalsOptions = {
  formatCents: (amountCents: number) => string;
  formatDiscountCents: (amountCents: number) => string;
  getRows: () => HTMLElement[];
  invoiceDiscountTotal: HTMLElement;
  invoiceDiscountType: HTMLSelectElement;
  invoiceDiscountValue: HTMLInputElement;
  invoiceSubtotal: HTMLElement;
  invoiceTax: HTMLElement;
  invoiceTotal: HTMLElement;
  invoiceWithholding?: HTMLElement | null;
  invoiceWithholdingLabel?: HTMLElement | null;
  invoiceWithholdingRate?: HTMLInputElement | null;
  invoiceWithholdingRow?: HTMLElement | null;
  invoiceWithholdingToggle?: HTMLInputElement | null;
  lineDiscountTotal: HTMLElement;
};

export const updateTotals = ({
  formatCents,
  formatDiscountCents,
  getRows,
  invoiceDiscountTotal,
  invoiceDiscountType,
  invoiceDiscountValue,
  invoiceSubtotal,
  invoiceTax,
  invoiceTotal,
  invoiceWithholding,
  invoiceWithholdingLabel,
  invoiceWithholdingRate,
  invoiceWithholdingRow,
  invoiceWithholdingToggle,
  lineDiscountTotal,
}: UpdateTotalsOptions) => {
  const rows = getRows();
  const applyWithholding = invoiceWithholdingToggle?.checked === true;
  const withholdingRate = invoiceWithholdingRate
    ? parseNumberInput(invoiceWithholdingRate)
    : 0;
  const totals = calculateInvoiceTotals(rows.map(readLineInput), {
    type: parseDiscountType(invoiceDiscountType),
    value: parseNumberInput(invoiceDiscountValue),
  }, applyWithholding ? { type: 'IRPF', rate: withholdingRate } : null);

  rows.forEach((row, index) => {
    const lineTotal = row.querySelector<HTMLElement>(
      '[data-invoice-line-total]',
    );

    if (lineTotal) {
      lineTotal.textContent = formatCents(totals.lines[index]?.totalCents ?? 0);
    }
  });

  invoiceSubtotal.textContent = formatCents(totals.subtotalCents);
  lineDiscountTotal.textContent = formatDiscountCents(
    totals.lineDiscountCents,
  );
  invoiceDiscountTotal.textContent = formatDiscountCents(totals.discountCents);
  invoiceTax.textContent = formatCents(totals.taxCents);
  if (invoiceWithholding && invoiceWithholdingRow) {
    invoiceWithholding.textContent = formatDiscountCents(
      totals.withholdingAmountCents,
    );
    invoiceWithholdingRow.classList.toggle(
      'hidden',
      !applyWithholding || totals.withholdingAmountCents <= 0,
    );
  }
  if (invoiceWithholdingLabel) {
    invoiceWithholdingLabel.textContent =
      applyWithholding && withholdingRate > 0
        ? `IRPF (${withholdingRate.toFixed(2).replace(/\.?0+$/, '')}%)`
        : 'IRPF';
  }
  invoiceTotal.textContent = formatCents(totals.totalCents);
  updateRemoveButtons(rows);
};
