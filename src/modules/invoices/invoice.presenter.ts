import {
  createInvoiceMetadataValues,
  createInvoicePaymentValues,
  type InvoiceMetadataErrors,
  type InvoiceMetadataIntent,
  type InvoiceMetadataValues,
  type InvoiceFormValues,
  type InvoicePaymentErrors,
  type InvoicePaymentValues,
} from './invoice.schema';
import type {
  InvoiceEmailErrors,
  InvoiceEmailValues,
} from './invoice-email.schema';
import {
  calculateInvoicePaymentSummary,
  canEditInvoice,
  canRecordInvoicePayment,
  getAllowedInvoiceStatusActions,
  type getInvoiceDetails,
  isInvoiceEffectivelyOverdue,
} from './invoice.service';

type InvoiceDetails = NonNullable<Awaited<ReturnType<typeof getInvoiceDetails>>>;

type InvoiceDisplaySource = InvoiceDetails & {
  organization?: {
    locale: string;
  };
};

type InvoiceLineDisplayInput = {
  totalCents: number;
  taxCents: number;
  taxRateBps: number;
};

const centsToAmountInput = (amountCents: number) =>
  (amountCents / 100).toFixed(2);

const dateToInputValue = (date: Date) => date.toISOString().slice(0, 10);

const formatTaxRateLabel = (taxRateBps: number) =>
  `${(taxRateBps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;

export const createInvoiceLineDisplays = <Line extends InvoiceLineDisplayInput>(
  lines: Line[],
) =>
  lines.map((line) => ({
    ...line,
    netCents: line.totalCents,
    taxRateLabel: formatTaxRateLabel(line.taxRateBps),
    displayTotalCents: line.totalCents + line.taxCents,
  }));

export const invoiceToFormValues = (invoice: InvoiceDetails): InvoiceFormValues => ({
  customerId: invoice.customerId,
  issueDate: dateToInputValue(invoice.issueDate),
  dueDate: dateToInputValue(invoice.dueDate),
  currency: invoice.currency,
  paymentInstructions: invoice.paymentInstructions ?? '',
  notes: invoice.notes ?? '',
  invoiceDiscountType: 'amount',
  invoiceDiscountValue: centsToAmountInput(invoice.discountCents),
  lines: invoice.lines.map((line) => ({
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: centsToAmountInput(line.unitPriceCents),
    discountType: 'amount',
    discountValue: centsToAmountInput(line.discountCents),
    taxRate: String(line.taxRateBps / 100),
  })),
});

export const createInvoiceDisplay = (invoice: InvoiceDisplaySource) => {
  const snapshot = invoice.status !== 'DRAFT' ? invoice.snapshot : null;

  return {
    customerName: snapshot?.customerName ?? invoice.customer.name,
    customerHref: snapshot ? null : `/customers/${invoice.customer.id}`,
    currency: invoice.currency,
    snapshot,
    isPrintable: invoice.status !== 'DRAFT' && Boolean(invoice.snapshot),
  };
};

export const invoiceDetailView = (
  invoice: InvoiceDetails,
  paymentValues?: InvoicePaymentValues,
  paymentErrors: InvoicePaymentErrors = {},
  metadataValues?: InvoiceMetadataValues,
  metadataErrors: InvoiceMetadataErrors = {},
  metadataEditor: InvoiceMetadataIntent | null = null,
) => {
  const paymentSummary = calculateInvoicePaymentSummary(invoice);
  const invoiceDisplay = createInvoiceDisplay(invoice);

  return {
    title: invoice.number,
    invoice,
    invoiceDisplay,
    invoiceLineDisplays: createInvoiceLineDisplays(invoice.lines),
    allowedActions: getAllowedInvoiceStatusActions(invoice.status),
    canEditInvoice: canEditInvoice(invoice.status),
    canRecordPayment:
      canRecordInvoicePayment(invoice.status) &&
      paymentSummary.outstandingCents > 0,
    isEffectivelyOverdue: isInvoiceEffectivelyOverdue(invoice),
    paymentSummary,
    paymentValues:
      paymentValues ??
      createInvoicePaymentValues(
        centsToAmountInput(paymentSummary.outstandingCents),
      ),
    paymentErrors,
    metadataValues:
      metadataValues ??
      createInvoiceMetadataValues(
        invoiceDisplay.snapshot?.paymentInstructions ??
          invoice.paymentInstructions ??
          '',
        invoice.notes ?? '',
      ),
    metadataErrors,
    metadataEditor,
    emailDeliveries: invoice.emailDeliveries ?? [],
  };
};

export const invoiceEmailView = (
  invoice: InvoiceDisplaySource,
  values: InvoiceEmailValues,
  errors: InvoiceEmailErrors = {},
) => ({
  title: `Email ${invoice.number}`,
  invoice,
  invoiceDisplay: createInvoiceDisplay(invoice),
  paymentSummary: calculateInvoicePaymentSummary(invoice),
  values: {
    toEmail:
      values.toEmail || createInvoiceDisplay(invoice).snapshot?.customerEmail || '',
  },
  errors,
});

export const invoicePrintView = (invoice: InvoiceDisplaySource) => {
  const invoiceDisplay = createInvoiceDisplay(invoice);

  return {
    title: `Print ${invoice.number}`,
    invoice,
    invoiceDisplay,
    invoiceLineDisplays: createInvoiceLineDisplays(invoice.lines),
    snapshot: invoiceDisplay.snapshot,
    paymentSummary: calculateInvoicePaymentSummary(invoice),
  };
};

export const publicInvoiceView = (invoice: InvoiceDisplaySource) => ({
  title: `Invoice ${invoice.number}`,
  invoice,
  invoiceDisplay: createInvoiceDisplay(invoice),
  invoiceLineDisplays: createInvoiceLineDisplays(invoice.lines),
  snapshot: createInvoiceDisplay(invoice).snapshot,
  isEffectivelyOverdue: isInvoiceEffectivelyOverdue(invoice),
  paymentSummary: calculateInvoicePaymentSummary(invoice),
  currentOrganization: invoice.organization,
});
